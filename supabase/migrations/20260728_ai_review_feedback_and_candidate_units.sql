-- Reviewer feedback, weekly monitoring, and concrete candidate unit rows.

CREATE TABLE IF NOT EXISTS public.dispatch_candidate_resources (
    candidate_id UUID NOT NULL REFERENCES public.dispatch_candidates(id) ON DELETE CASCADE,
    resource_id INTEGER NOT NULL REFERENCES public.agency_resources(id),
    capability_code TEXT,
    PRIMARY KEY (candidate_id, resource_id)
);

CREATE TABLE IF NOT EXISTS public.dispatch_candidate_officers (
    candidate_id UUID NOT NULL REFERENCES public.dispatch_candidates(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id),
    PRIMARY KEY (candidate_id, officer_id)
);

CREATE TABLE IF NOT EXISTS public.dispatch_review_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES public.dispatch_recommendations(id) ON DELETE SET NULL,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
    verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'modified', 'rejected', 'not_applicable')),
    actual_incident_type TEXT,
    actual_severity SMALLINT CHECK (actual_severity BETWEEN 1 AND 5),
    actual_agency_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    final_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(actual_agency_codes) = 'array'),
    CHECK (jsonb_typeof(final_capabilities) = 'array'),
    CHECK (jsonb_typeof(reason_codes) = 'array')
);

ALTER TABLE public.incident_triage_assessments
    ADD COLUMN IF NOT EXISTS incident_type TEXT;

ALTER TABLE public.dispatch_candidate_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_candidate_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_review_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dispatch_candidate_resources, public.dispatch_candidate_officers, public.dispatch_review_feedback FROM anon;
GRANT SELECT ON TABLE public.dispatch_candidate_resources, public.dispatch_candidate_officers, public.dispatch_review_feedback TO authenticated;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_candidate_resources' AND policyname='candidate_resources_dispatch_staff_read') THEN
        CREATE POLICY candidate_resources_dispatch_staff_read ON public.dispatch_candidate_resources FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('Admin','Chief','Desk Officer','Field Officer')));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_candidate_officers' AND policyname='candidate_officers_dispatch_staff_read') THEN
        CREATE POLICY candidate_officers_dispatch_staff_read ON public.dispatch_candidate_officers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('Admin','Chief','Desk Officer','Field Officer')));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_review_feedback' AND policyname='review_feedback_dispatch_staff_read') THEN
        CREATE POLICY review_feedback_dispatch_staff_read ON public.dispatch_review_feedback FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('Admin','Chief','Desk Officer','Field Officer')));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_dispatch_review_feedback(
    p_incident_id UUID,
    p_recommendation_id UUID,
    p_reviewer_id UUID,
    p_verdict TEXT,
    p_actual_incident_type TEXT DEFAULT NULL,
    p_actual_severity SMALLINT DEFAULT NULL,
    p_actual_agency_codes JSONB DEFAULT '[]'::jsonb,
    p_final_capabilities JSONB DEFAULT '[]'::jsonb,
    p_reason_codes JSONB DEFAULT '[]'::jsonb,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE feedback_id UUID;
BEGIN
    IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_reviewer_id THEN
        RAISE EXCEPTION 'Reviewer identity must match the authenticated user';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_reviewer_id AND p.role IN ('Admin','Chief','Desk Officer')) THEN
        RAISE EXCEPTION 'A verified dispatch reviewer is required';
    END IF;
    INSERT INTO public.dispatch_review_feedback(
        incident_id, recommendation_id, reviewer_id, verdict, actual_incident_type,
        actual_severity, actual_agency_codes, final_capabilities, reason_codes, notes
    ) VALUES (
        p_incident_id, p_recommendation_id, p_reviewer_id, p_verdict,
        NULLIF(trim(p_actual_incident_type), ''), p_actual_severity,
        COALESCE(p_actual_agency_codes,'[]'::jsonb), COALESCE(p_final_capabilities,'[]'::jsonb),
        COALESCE(p_reason_codes,'[]'::jsonb), NULLIF(trim(p_notes), '')
    ) RETURNING id INTO feedback_id;
    RETURN feedback_id;
END $$;

REVOKE ALL ON FUNCTION public.record_dispatch_review_feedback(UUID,UUID,UUID,TEXT,TEXT,SMALLINT,JSONB,JSONB,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_dispatch_review_feedback(UUID,UUID,UUID,TEXT,TEXT,SMALLINT,JSONB,JSONB,JSONB,TEXT) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.ai_dispatch_weekly_metrics AS
SELECT
    date_trunc('week', f.created_at) AS week_start,
    count(*) AS reviewed_count,
    count(*) FILTER (WHERE f.verdict='accepted') AS accepted_count,
    count(*) FILTER (WHERE f.verdict='modified') AS modified_count,
    count(*) FILTER (WHERE f.verdict='rejected') AS rejected_count,
    round(avg((f.actual_severity = ta.severity)::INT)::NUMERIC, 4) AS severity_exact_match_rate,
    round(avg((f.actual_incident_type IS NULL OR f.actual_incident_type = (ta.evidence->>'incident_type'))::INT)::NUMERIC, 4) AS incident_type_match_rate,
    round(avg((jsonb_array_length(f.actual_agency_codes) > 0)::INT)::NUMERIC, 4) AS agency_feedback_available_rate
FROM public.dispatch_review_feedback f
LEFT JOIN public.dispatch_recommendations dr ON dr.id=f.recommendation_id
LEFT JOIN public.incident_triage_assessments ta ON ta.id=dr.triage_assessment_id
GROUP BY 1;

GRANT SELECT ON public.ai_dispatch_weekly_metrics TO authenticated;

-- Extend operational context with real available officer IDs. This is still
-- read-only context; approval remains the only assignment path.
DROP FUNCTION IF EXISTS public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC);
CREATE FUNCTION public.get_nearby_operational_context(
    target_lat NUMERIC, target_lon NUMERIC, radius_km NUMERIC DEFAULT 5
) RETURNS TABLE (
    station_id INTEGER, agency_id INTEGER, station_name TEXT, agency_name TEXT,
    distance_meters NUMERIC, available_officers BIGINT, available_resources BIGINT,
    available_resource_ids INTEGER[], available_officer_ids UUID[], operational_data_as_of TIMESTAMPTZ
) LANGUAGE SQL SECURITY DEFINER SET search_path=public AS $$
    SELECT s.id, a.id, s.name, a.name, distance.distance_meters,
        (SELECT COUNT(*) FROM public.profiles p WHERE p.station_id=s.id AND p.agency_id=a.id AND p.role='Field Officer' AND p.status='available'),
        (SELECT COUNT(*) FROM public.agency_resources r WHERE r.station_id=s.id AND r.status='available'),
        COALESCE((SELECT ARRAY_AGG(r.id ORDER BY r.id) FROM public.agency_resources r WHERE r.station_id=s.id AND r.status='available'), ARRAY[]::INTEGER[]),
        COALESCE((SELECT ARRAY_AGG(p.id ORDER BY p.id) FROM public.profiles p WHERE p.station_id=s.id AND p.agency_id=a.id AND p.role='Field Officer' AND p.status='available'), ARRAY[]::UUID[]), NOW()
    FROM public.agency_stations s JOIN public.agencies a ON a.id=s.agency_id
    CROSS JOIN LATERAL (SELECT (6371000 * ACOS(LEAST(1.0, GREATEST(-1.0,
        COS(RADIANS(target_lat))*COS(RADIANS(s.latitude))*COS(RADIANS(s.longitude)-RADIANS(target_lon))+
        SIN(RADIANS(target_lat))*SIN(RADIANS(s.latitude))))))::NUMERIC AS distance_meters) distance
    WHERE distance.distance_meters <= radius_km * 1000
    ORDER BY distance.distance_meters ASC LIMIT 10;
$$;
REVOKE ALL ON FUNCTION public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;
