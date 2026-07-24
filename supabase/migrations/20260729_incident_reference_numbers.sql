-- Human-readable incident references such as INC-2026-00001.
-- UUIDs remain the primary and foreign-key identifiers.

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS reference_year smallint,
  ADD COLUMN IF NOT EXISTS reference_number integer;

-- Backfill deterministically within each creation year. UUID is the stable
-- tie-breaker for incidents created at the same timestamp.
WITH numbered AS (
  SELECT
    id,
    EXTRACT(YEAR FROM COALESCE(created_at, now()))::smallint AS reference_year,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM COALESCE(created_at, now()))
      ORDER BY COALESCE(created_at, 'epoch'::timestamptz), id
    )::integer AS reference_number
  FROM public.incidents
  WHERE reference_year IS NULL OR reference_number IS NULL
)
UPDATE public.incidents AS incidents
SET
  reference_year = numbered.reference_year,
  reference_number = numbered.reference_number
FROM numbered
WHERE incidents.id = numbered.id;

CREATE TABLE IF NOT EXISTS public.incident_reference_counters (
  reference_year smallint PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.incident_reference_counters (reference_year, last_number)
SELECT reference_year, MAX(reference_number)
FROM public.incidents
WHERE reference_year IS NOT NULL AND reference_number IS NOT NULL
GROUP BY reference_year
ON CONFLICT (reference_year) DO UPDATE
SET
  last_number = GREATEST(
    public.incident_reference_counters.last_number,
    EXCLUDED.last_number
  ),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.assign_incident_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_year smallint;
  allocated_number integer;
BEGIN
  target_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::smallint;

  IF NEW.reference_year IS NULL THEN
    NEW.reference_year := target_year;
  END IF;

  IF NEW.reference_number IS NULL THEN
    INSERT INTO public.incident_reference_counters (
      reference_year,
      last_number,
      updated_at
    )
    VALUES (NEW.reference_year, 1, now())
    ON CONFLICT (reference_year) DO UPDATE
    SET
      last_number = public.incident_reference_counters.last_number + 1,
      updated_at = now()
    RETURNING last_number INTO allocated_number;

    NEW.reference_number := allocated_number;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_incident_reference_before_insert ON public.incidents;
CREATE TRIGGER assign_incident_reference_before_insert
BEFORE INSERT ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.assign_incident_reference();

ALTER TABLE public.incidents
  ALTER COLUMN reference_year SET NOT NULL,
  ALTER COLUMN reference_number SET NOT NULL;

ALTER TABLE public.incidents
  DROP CONSTRAINT IF EXISTS incidents_reference_year_number_key,
  ADD CONSTRAINT incidents_reference_year_number_key
    UNIQUE (reference_year, reference_number),
  DROP CONSTRAINT IF EXISTS incidents_reference_year_check,
  ADD CONSTRAINT incidents_reference_year_check
    CHECK (reference_year BETWEEN 2000 AND 9999),
  DROP CONSTRAINT IF EXISTS incidents_reference_number_check,
  ADD CONSTRAINT incidents_reference_number_check
    CHECK (reference_number > 0);

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS incident_reference text
  GENERATED ALWAYS AS (
    'INC-' || reference_year::text || '-' || lpad(reference_number::text, 5, '0')
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS incidents_incident_reference_key
  ON public.incidents (incident_reference);

CREATE INDEX IF NOT EXISTS incidents_reference_year_idx
  ON public.incidents (reference_year, reference_number DESC);

REVOKE ALL ON TABLE public.incident_reference_counters FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_incident_reference() FROM PUBLIC;

COMMENT ON COLUMN public.incidents.incident_reference IS
  'Public human-readable reference. UUID id remains the internal primary key.';

