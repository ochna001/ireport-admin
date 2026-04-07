-- Trigger to create notifications when officers are assigned to incidents
-- This ensures push notifications are sent to assigned officers

CREATE OR REPLACE FUNCTION notify_officers_on_assignment()
RETURNS TRIGGER AS $$
DECLARE
  officer_id uuid;
  incident_short_id text;
BEGIN
  -- Only proceed if assigned_officer_ids changed
  IF (TG_OP = 'UPDATE' AND 
      (OLD.assigned_officer_ids IS DISTINCT FROM NEW.assigned_officer_ids)) THEN
    
    -- Get short incident ID for display
    incident_short_id := UPPER(SUBSTRING(NEW.id::text, 1, 8));
    
    -- Create notifications for newly assigned officers
    IF NEW.assigned_officer_ids IS NOT NULL THEN
      FOREACH officer_id IN ARRAY NEW.assigned_officer_ids
      LOOP
        -- Only notify if this officer wasn't previously assigned
        IF OLD.assigned_officer_ids IS NULL OR 
           NOT (officer_id = ANY(OLD.assigned_officer_ids)) THEN
          
          INSERT INTO notifications (recipient_id, incident_id, title, body, is_read, created_at)
          VALUES (
            officer_id,
            NEW.id,
            'New Incident Assignment',
            'You have been assigned to incident #' || incident_short_id || ' - ' || COALESCE(NEW.description, 'No description'),
            false,
            NOW()
          );
          
          RAISE NOTICE 'Created notification for officer % on incident %', officer_id, incident_short_id;
        END IF;
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS notify_officers_on_assignment_trigger ON incidents;

-- Create the trigger
CREATE TRIGGER notify_officers_on_assignment_trigger
  AFTER UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION notify_officers_on_assignment();

-- Test the trigger works
COMMENT ON FUNCTION notify_officers_on_assignment() IS 'Creates notifications when officers are assigned to incidents. Push notifications are then sent by the admin app PushNotificationService.';
