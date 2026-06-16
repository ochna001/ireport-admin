-- =====================================================
-- Backup Requests Workflow (Phase 2)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.backup_requests (
  id BIGSERIAL PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_agency_id INTEGER REFERENCES public.agencies(id) ON DELETE SET NULL,
  requested_station_id INTEGER REFERENCES public.agency_stations(id) ON DELETE SET NULL,
  target_agency_id INTEGER REFERENCES public.agencies(id) ON DELETE SET NULL,
  target_station_id INTEGER REFERENCES public.agency_stations(id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'assigned', 'resolved', 'cancelled', 'rejected')),
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_requests_incident_id ON public.backup_requests(incident_id);
CREATE INDEX IF NOT EXISTS idx_backup_requests_status ON public.backup_requests(status);
CREATE INDEX IF NOT EXISTS idx_backup_requests_created_at ON public.backup_requests(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_backup_requests_active_per_incident
  ON public.backup_requests(incident_id)
  WHERE status IN ('pending', 'acknowledged', 'assigned');

CREATE OR REPLACE FUNCTION public.set_backup_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_backup_request_updated_at ON public.backup_requests;
CREATE TRIGGER trg_set_backup_request_updated_at
BEFORE UPDATE ON public.backup_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_backup_request_updated_at();

CREATE OR REPLACE FUNCTION public.notify_on_backup_request_create()
RETURNS TRIGGER AS $$
DECLARE
  requester_name TEXT;
  incident_address TEXT;
  incident_short_id TEXT;
  recipient RECORD;
BEGIN
  SELECT COALESCE(p.display_name, 'Field Officer')
  INTO requester_name
  FROM public.profiles p
  WHERE p.id = NEW.requested_by;

  SELECT COALESCE(i.location_address, 'Unknown location')
  INTO incident_address
  FROM public.incidents i
  WHERE i.id = NEW.incident_id;

  incident_short_id := UPPER(SUBSTRING(CAST(NEW.incident_id AS TEXT) FROM 1 FOR 8));

  FOR recipient IN
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE p.role = 'Admin'
       OR (
         p.agency_id = NEW.requested_agency_id
         AND p.role IN ('Desk Officer', 'Chief')
       )
  LOOP
    IF recipient.id IS DISTINCT FROM NEW.requested_by THEN
      INSERT INTO public.notifications (
        recipient_id,
        incident_id,
        title,
        body,
        is_read,
        created_at
      ) VALUES (
        recipient.id,
        NEW.incident_id,
        '🚨 Backup Request',
        requester_name || ' requested backup for incident #' || incident_short_id || ' at ' || incident_address || '.',
        FALSE,
        NOW()
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_backup_request_create ON public.backup_requests;
CREATE TRIGGER trg_notify_on_backup_request_create
AFTER INSERT ON public.backup_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_backup_request_create();

COMMENT ON TABLE public.backup_requests IS 'Tracks backup support workflow for incidents from request through resolution.';
COMMENT ON FUNCTION public.notify_on_backup_request_create() IS 'Creates notification rows for Admins and agency dispatch leadership when a backup request is created.';
