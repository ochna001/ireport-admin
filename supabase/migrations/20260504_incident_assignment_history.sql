CREATE TABLE IF NOT EXISTS public.incident_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  previous_station_id integer REFERENCES public.agency_stations(id),
  new_station_id integer REFERENCES public.agency_stations(id),
  previous_officer_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  new_officer_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  previous_resource_ids integer[] NOT NULL DEFAULT '{}'::integer[],
  new_resource_ids integer[] NOT NULL DEFAULT '{}'::integer[],
  agency_ids integer[] NOT NULL DEFAULT '{}'::integer[],
  reason text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id),
  changed_by_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_assignment_history_incident_id
ON public.incident_assignment_history(incident_id);

CREATE INDEX IF NOT EXISTS idx_incident_assignment_history_created_at
ON public.incident_assignment_history(created_at DESC);

ALTER TABLE public.incident_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read incident assignment history" ON public.incident_assignment_history;
CREATE POLICY "Authenticated users can read incident assignment history"
ON public.incident_assignment_history FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert incident assignment history" ON public.incident_assignment_history;
CREATE POLICY "Authenticated users can insert incident assignment history"
ON public.incident_assignment_history FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, INSERT ON public.incident_assignment_history TO authenticated;
