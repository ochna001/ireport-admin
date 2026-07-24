-- Phase 1: versioned, structured AI triage assessments.
-- Advisory assessment only. This migration does not assign agencies,
-- stations, officers, or resources.

CREATE TABLE IF NOT EXISTS public.incident_triage_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    assessment_version INTEGER NOT NULL DEFAULT 1 CHECK (assessment_version > 0),
    assessment_source TEXT NOT NULL DEFAULT 'ai'
        CHECK (assessment_source IN ('ai', 'human', 'hybrid')),
    severity SMALLINT CHECK (severity BETWEEN 1 AND 5),
    urgency TEXT CHECK (urgency IN ('U1', 'U2', 'U3', 'U4')),
    evidence_confidence TEXT CHECK (evidence_confidence IN ('low', 'medium', 'high')),
    dispatch_priority SMALLINT CHECK (dispatch_priority BETWEEN 1 AND 5),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
    triggered_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    rubric_version TEXT,
    rules_version TEXT,
    input_snapshot_hash TEXT,
    supersedes_assessment_id UUID REFERENCES public.incident_triage_assessments(id),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT incident_triage_assessments_version_unique UNIQUE (incident_id, assessment_version),
    CONSTRAINT incident_triage_assessments_json_object_check CHECK (
        jsonb_typeof(evidence) = 'object' AND jsonb_typeof(model_metadata) = 'object'
    ),
    CONSTRAINT incident_triage_assessments_json_arrays_check CHECK (
        jsonb_typeof(missing_facts) = 'array' AND
        jsonb_typeof(contradictions) = 'array' AND
        jsonb_typeof(triggered_rules) = 'array'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_triage_assessments_one_current
    ON public.incident_triage_assessments (incident_id)
    WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_triage_assessments_incident_created
    ON public.incident_triage_assessments (incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_triage_assessments_priority
    ON public.incident_triage_assessments (dispatch_priority DESC, created_at DESC)
    WHERE is_current = TRUE;

COMMENT ON TABLE public.incident_triage_assessments IS
    'Versioned AI/human triage evidence. Advisory only; never an operational assignment.';

ALTER TABLE public.incident_triage_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.incident_triage_assessments FROM anon;
GRANT SELECT ON TABLE public.incident_triage_assessments TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'incident_triage_assessments'
          AND policyname = 'Dispatch staff can read triage assessments'
    ) THEN
        CREATE POLICY "Dispatch staff can read triage assessments"
            ON public.incident_triage_assessments
            FOR SELECT TO authenticated
            USING (EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role IN ('Admin', 'Chief', 'Desk Officer', 'Field Officer')
            ));
    END IF;
END;
$$;
