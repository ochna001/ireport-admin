-- Migration: Add status history table for conflict resolution
-- Run this in Supabase SQL Editor

-- Create incident_status_history table (append-only for audit trail)
CREATE TABLE IF NOT EXISTS incident_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_status_history_incident_id 
ON incident_status_history(incident_id);

CREATE INDEX IF NOT EXISTS idx_status_history_changed_at 
ON incident_status_history(changed_at DESC);

-- Add updated_by column to incidents if not exists
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Enable RLS
ALTER TABLE incident_status_history ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read status history
CREATE POLICY "Anyone can read status history"
ON incident_status_history FOR SELECT
USING (true);

-- Policy: Authenticated users can insert status history
CREATE POLICY "Authenticated users can insert status history"
ON incident_status_history FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Trigger to auto-insert status history when incident status changes
CREATE OR REPLACE FUNCTION log_incident_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO incident_status_history (incident_id, status, changed_by, changed_at)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.updated_by, 'system'), NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_incident_status_change ON incidents;

CREATE TRIGGER on_incident_status_change
AFTER UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION log_incident_status_change();

-- Grant permissions
GRANT SELECT ON incident_status_history TO anon;
GRANT SELECT, INSERT ON incident_status_history TO authenticated;
