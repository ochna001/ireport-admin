-- =====================================================
-- Rename PDRRMO agency type to MDRRMO
-- =====================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'agency_type'
      AND data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET agency_type = %L WHERE LOWER(agency_type) = %L',
      r.table_schema,
      r.table_name,
      'mdrrmo',
      'pdrrmo'
    );
  END LOOP;
END $$;

UPDATE public.agencies
SET short_name = 'MDRRMO'
WHERE UPPER(short_name) = 'PDRRMO'
  AND NOT EXISTS (
    SELECT 1
    FROM public.agencies existing
    WHERE UPPER(existing.short_name) = 'MDRRMO'
  );

UPDATE public.agencies
SET name = REPLACE(name, 'Provincial Disaster Risk Reduction and Management Office', 'Municipal Disaster Risk Reduction and Management Office')
WHERE short_name = 'MDRRMO'
  AND name ILIKE '%Provincial Disaster Risk Reduction%';

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_agency_type_check;
ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_agency_type_check
  CHECK (agency_type = ANY (ARRAY['pnp'::text, 'bfp'::text, 'mdrrmo'::text]));
