-- Fast Report support: add is_fast_report column, ai_routing status, and allow unknown agency_type

-- 1. Add fast-report flag
ALTER TABLE public.incidents
ADD COLUMN IF NOT EXISTS is_fast_report BOOLEAN DEFAULT false;

-- 2. Add reporter_phone if missing (used in resident app for guest reporters)
ALTER TABLE public.incidents
ADD COLUMN IF NOT EXISTS reporter_phone TEXT;

-- 3. Update agency_type to allow 'unknown' for fast reports before AI triage
-- Drop the old check and recreate with 'unknown' included
DO $$
BEGIN
    -- Drop existing check constraint if it exists (handles both naming conventions)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'incidents' AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%agency_type%'
    ) THEN
        ALTER TABLE public.incidents
        DROP CONSTRAINT incidents_agency_type_check;
    END IF;

    -- Also try the alternate name from schema dump
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'incidents' AND constraint_type = 'CHECK'
        AND constraint_name = 'incidents_agency_type_check'
    ) THEN
        ALTER TABLE public.incidents
        DROP CONSTRAINT incidents_agency_type_check;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- constraint may not exist, continue
END $$;

-- Add new agency_type check including 'unknown'
ALTER TABLE public.incidents
ADD CONSTRAINT incidents_agency_type_check
CHECK (agency_type = ANY (ARRAY['pnp'::text, 'bfp'::text, 'pdrrmo'::text, 'mdrrmo'::text, 'unknown'::text]));

-- Also make agency_type nullable as a safety net
ALTER TABLE public.incidents
ALTER COLUMN agency_type DROP NOT NULL;

-- 4. Update status to include 'ai_routing'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'incidents' AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%status%'
    ) THEN
        ALTER TABLE public.incidents
        DROP CONSTRAINT incidents_status_check;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- constraint may not exist, continue
END $$;

ALTER TABLE public.incidents
ADD CONSTRAINT incidents_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text, 'rejected'::text, 'ai_routing'::text]));

-- 5. Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_incidents_is_fast_report ON public.incidents(is_fast_report);
CREATE INDEX IF NOT EXISTS idx_incidents_ai_status ON public.incidents(ai_status);

-- 6. Add updated_at trigger for is_fast_report visibility (optional, but good)
COMMENT ON COLUMN public.incidents.is_fast_report IS 'True if this incident was created via the Fast Report FAB and is awaiting AI triage.';
COMMENT ON COLUMN public.incidents.ai_status IS 'AI processing status: pending, processing, completed, failed.';
