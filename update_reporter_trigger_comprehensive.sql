-- Enhanced trigger to notify reporters on ANY incident update
-- This includes status changes, notes, officer assignments, etc.

-- Drop the old trigger
DROP TRIGGER IF EXISTS notify_reporter_on_status_change_trigger ON incidents;

-- Create new comprehensive function
CREATE OR REPLACE FUNCTION notify_reporter_on_incident_update()
RETURNS TRIGGER AS $$
DECLARE
  notification_body TEXT;
BEGIN
  -- Only notify if there's a reporter
  IF NEW.reporter_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build notification body based on what changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    notification_body := 'Your incident status has been updated to: ' || NEW.status;
  ELSIF OLD.assigned_officer_ids IS DISTINCT FROM NEW.assigned_officer_ids THEN
    notification_body := 'An officer has been assigned to your incident';
  ELSIF NEW.updated_at > OLD.updated_at THEN
    notification_body := 'Your incident has been updated by the response team';
  ELSE
    -- Generic update message
    notification_body := 'Your incident has been updated';
  END IF;

  -- Insert notification for the reporter
  INSERT INTO notifications (recipient_id, incident_id, title, body, created_at)
  VALUES (
    NEW.reporter_id,
    NEW.id,
    'Incident Update',
    notification_body,
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the new trigger (fires on ANY update)
CREATE TRIGGER notify_reporter_on_incident_update_trigger
  AFTER UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION notify_reporter_on_incident_update();

-- Verify the trigger was created
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table, 
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'incidents'
  AND trigger_name LIKE '%reporter%'
ORDER BY trigger_name;
