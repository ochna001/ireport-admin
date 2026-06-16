-- Create incident AI reports table
CREATE TABLE IF NOT EXISTS public.incident_ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    severity INTEGER CHECK (severity >= 1 AND severity <= 5),
    hazards JSONB DEFAULT '[]'::jsonb,
    summary TEXT,
    raw_vlm_output JSONB,
    model_metadata JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Ensure only one active/completed AI report per incident at a time (optional, but good for cleanliness)
    UNIQUE(incident_id)
);

-- Denormalized quick filters on incidents table
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT 'pending' CHECK (ai_status IN ('pending', 'processing', 'completed', 'failed'));
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS ai_severity INTEGER;

-- Enable RLS
ALTER TABLE public.incident_ai_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for incident_ai_reports
-- Everyone can select
CREATE POLICY "Enable read access for all on incident_ai_reports" ON public.incident_ai_reports
    FOR SELECT USING (true);

-- Only authenticated backend (service role) can insert/update
CREATE POLICY "Enable insert for service role on incident_ai_reports" ON public.incident_ai_reports
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for service role on incident_ai_reports" ON public.incident_ai_reports
    FOR UPDATE USING (true);

-- Insert trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_incident_ai_reports_updated_at
BEFORE UPDATE ON public.incident_ai_reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
