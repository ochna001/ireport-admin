-- =====================================================
-- Fix duplicate new incident station notifications
-- =====================================================
-- Problem:
-- Resident app inserts an incident first, then auto-assigns the nearest station
-- in a second update. The previous trigger notified on both INSERT without a
-- station and UPDATE with a station, causing duplicate "New Report" alerts.
--
-- New behavior:
-- 1. INSERT with assigned_station_id: notify assigned station once.
-- 2. INSERT without assigned_station_id: do not notify yet; wait for assignment.
-- 3. UPDATE from no station to station: notify assigned station once.
-- 4. UPDATE from one station to another: notify new station with reassignment text.
-- =====================================================

CREATE OR REPLACE FUNCTION public.notify_station_on_new_incident()
RETURNS TRIGGER AS $$
DECLARE
  officer_record RECORD;
  notification_title TEXT;
  notification_body TEXT;
  agency_name TEXT;
  station_name TEXT;
  is_initial_assignment BOOLEAN := FALSE;
  is_reassignment BOOLEAN := FALSE;
BEGIN
  agency_name := UPPER(COALESCE(NEW.agency_type, 'INCIDENT'));

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_station_id IS NULL THEN
      RETURN NEW;
    END IF;

    is_initial_assignment := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_station_id IS NULL OR NEW.assigned_station_id IS NOT DISTINCT FROM OLD.assigned_station_id THEN
      RETURN NEW;
    END IF;

    is_initial_assignment := OLD.assigned_station_id IS NULL;
    is_reassignment := OLD.assigned_station_id IS NOT NULL;
  ELSE
    RETURN NEW;
  END IF;

  SELECT name INTO station_name
  FROM public.agency_stations
  WHERE id = NEW.assigned_station_id;

  IF is_reassignment THEN
    notification_title := '📍 ' || agency_name || ' Incident Reassigned';
    notification_body := 'An incident has been reassigned to ' || COALESCE(station_name, 'your station') || ' at ' ||
      COALESCE(SUBSTRING(NEW.location_address FROM 1 FOR 60), 'Unknown location') || '.';
  ELSE
    notification_title := '🚨 New ' || agency_name || ' Report';
    notification_body := 'New incident assigned to ' || COALESCE(station_name, 'your station') || ' at ' ||
      COALESCE(SUBSTRING(NEW.location_address FROM 1 FOR 60), 'Unknown location') ||
      '. Reporter: ' || COALESCE(NEW.reporter_name, 'Anonymous') || '.';
  END IF;

  FOR officer_record IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.station_id = NEW.assigned_station_id
      AND p.role IN ('Desk Officer', 'Chief')
      AND p.id != COALESCE(NEW.reporter_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (
      recipient_id,
      incident_id,
      title,
      body,
      is_read,
      created_at
    ) VALUES (
      officer_record.id,
      NEW.id,
      notification_title,
      notification_body,
      false,
      NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_station_on_incident_insert ON public.incidents;
DROP TRIGGER IF EXISTS notify_station_on_incident_update ON public.incidents;

CREATE TRIGGER notify_station_on_incident_insert
AFTER INSERT ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.notify_station_on_new_incident();

CREATE TRIGGER notify_station_on_incident_update
AFTER UPDATE ON public.incidents
FOR EACH ROW
WHEN (NEW.assigned_station_id IS DISTINCT FROM OLD.assigned_station_id)
EXECUTE FUNCTION public.notify_station_on_new_incident();

COMMENT ON FUNCTION public.notify_station_on_new_incident() IS 'Notifies Desk Officers and Chiefs only when an incident is assigned to their station; avoids duplicate insert + auto-assignment notifications';
