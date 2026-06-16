-- Extend security_logs table for comprehensive admin activity logging
-- Created: 2026-05-04

-- Add new columns for better activity tracking
ALTER TABLE public.security_logs
ADD COLUMN IF NOT EXISTS entity_type TEXT,
ADD COLUMN IF NOT EXISTS entity_id TEXT,
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.security_logs.entity_type IS 'Type of entity affected: incident, user, station, resource, report, media, settings, export, backup_request, agency';
COMMENT ON COLUMN public.security_logs.entity_id IS 'ID of the affected entity record';
COMMENT ON COLUMN public.security_logs.user_email IS 'Email of the user who performed the action (for display without joins)';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_logs_entity_type ON public.security_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_entity_id ON public.security_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_user_email ON public.security_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_security_logs_action ON public.security_logs(action);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON public.security_logs(created_at DESC);

-- Create a composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_security_logs_entity_action ON public.security_logs(entity_type, action);

-- Enable RLS (if not already enabled)
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists to avoid conflicts
DROP POLICY IF EXISTS "Allow all operations on security_logs" ON public.security_logs;

-- Create RLS policy to allow all authenticated operations
-- This is an internal logging table, so we allow full access for authenticated users
CREATE POLICY "Allow all operations on security_logs" 
ON public.security_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
