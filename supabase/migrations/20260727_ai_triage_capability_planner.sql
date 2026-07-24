-- Capability catalogs and one-transaction AI triage/recommendation persistence.
-- AI remains advisory; only approve_dispatch_recommendation can assign resources.

CREATE TABLE IF NOT EXISTS public.dispatch_capabilities (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.agency_capabilities (
    agency_id INTEGER NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    capability_code TEXT NOT NULL REFERENCES public.dispatch_capabilities(code) ON DELETE CASCADE,
    PRIMARY KEY (agency_id, capability_code)
);

ALTER TABLE public.dispatch_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dispatch_capabilities, public.agency_capabilities FROM anon;
GRANT SELECT ON TABLE public.dispatch_capabilities, public.agency_capabilities TO authenticated;

CREATE TABLE IF NOT EXISTS public.dispatch_recommendation_agencies (
    recommendation_id UUID NOT NULL REFERENCES public.dispatch_recommendations(id) ON DELETE CASCADE,
    agency_id INTEGER NOT NULL REFERENCES public.agencies(id),
    role TEXT NOT NULL CHECK (role IN ('primary', 'support')),
    rank INTEGER NOT NULL CHECK (rank > 0),
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (recommendation_id, agency_id),
    CHECK (jsonb_typeof(reason_codes) = 'array')
);

ALTER TABLE public.dispatch_recommendations
    ADD COLUMN IF NOT EXISTS planning_state TEXT NOT NULL DEFAULT 'needs_review',
    ADD COLUMN IF NOT EXISTS planning_error TEXT,
    ADD COLUMN IF NOT EXISTS emergency_state TEXT,
    ADD COLUMN IF NOT EXISTS routing_state TEXT;

ALTER TABLE public.dispatch_recommendations
    DROP CONSTRAINT IF EXISTS dispatch_recommendations_state_check;
ALTER TABLE public.dispatch_recommendations
    ADD CONSTRAINT dispatch_recommendations_state_check
    CHECK (state IN ('ready', 'approved', 'revised', 'rejected', 'expired', 'needs_review'));

ALTER TABLE public.dispatch_decisions
    DROP CONSTRAINT IF EXISTS dispatch_decisions_override_reason_check;
ALTER TABLE public.dispatch_decisions
    ADD CONSTRAINT dispatch_decisions_override_reason_check
    CHECK (action <> 'override' OR NULLIF(trim(reason), '') IS NOT NULL);

CREATE OR REPLACE FUNCTION public.validate_assignment_ownership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE station_agency TEXT;
BEGIN
    IF NEW.assigned_station_id IS NULL THEN RETURN NEW; END IF;
    SELECT lower(a.short_name) INTO station_agency
    FROM public.agency_stations s JOIN public.agencies a ON a.id=s.agency_id
    WHERE s.id=NEW.assigned_station_id;
    IF station_agency IS NULL THEN RAISE EXCEPTION 'Assigned station is not linked to an agency'; END IF;
    IF lower(COALESCE(NEW.agency_type,'')) <> station_agency THEN
        RAISE EXCEPTION 'Assigned station agency does not match incident agency';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(COALESCE(NEW.assigned_officer_ids, ARRAY[]::UUID[])) ids(id)
               LEFT JOIN public.profiles p ON p.id=ids.id
               WHERE p.id IS NULL OR p.station_id IS DISTINCT FROM NEW.assigned_station_id
                  OR p.agency_id IS DISTINCT FROM (SELECT a.id FROM public.agencies a WHERE lower(a.short_name)=station_agency)) THEN
        RAISE EXCEPTION 'Selected officer is not owned by the assigned station and agency';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(COALESCE(NEW.assigned_resource_ids, ARRAY[]::INTEGER[])) ids(id)
               LEFT JOIN public.agency_resources r ON r.id=ids.id
               WHERE r.id IS NULL OR r.station_id IS DISTINCT FROM NEW.assigned_station_id) THEN
        RAISE EXCEPTION 'Selected resource is not owned by the assigned station';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS incidents_validate_assignment_ownership ON public.incidents;
CREATE TRIGGER incidents_validate_assignment_ownership
BEFORE UPDATE OF assigned_station_id, assigned_officer_ids, assigned_resource_ids, agency_type
ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.validate_assignment_ownership();

INSERT INTO public.dispatch_capabilities(code, label) VALUES
    ('fire_suppression', 'Fire suppression'), ('rescue', 'Rescue'),
    ('extrication', 'Vehicle extrication'), ('hazmat', 'Hazardous materials'),
    ('law_enforcement', 'Law enforcement'), ('scene_security', 'Scene security'),
    ('traffic_control', 'Traffic control'), ('ems', 'Emergency medical care'),
    ('medical_transport', 'Medical transport'), ('water_rescue', 'Water rescue'),
    ('evacuation', 'Evacuation'), ('disaster_coordination', 'Disaster coordination'),
    ('debris_clearance', 'Debris clearance')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.agency_capabilities(agency_id, capability_code)
SELECT a.id, c.code FROM public.agencies a CROSS JOIN public.dispatch_capabilities c
WHERE lower(a.short_name) = 'bfp' AND c.code IN ('fire_suppression','rescue','extrication','hazmat')
ON CONFLICT DO NOTHING;
INSERT INTO public.agency_capabilities(agency_id, capability_code)
SELECT a.id, c.code FROM public.agencies a CROSS JOIN public.dispatch_capabilities c
WHERE lower(a.short_name) = 'pnp' AND c.code IN ('law_enforcement','traffic_control','scene_security')
ON CONFLICT DO NOTHING;
INSERT INTO public.agency_capabilities(agency_id, capability_code)
SELECT a.id, c.code FROM public.agencies a CROSS JOIN public.dispatch_capabilities c
WHERE lower(a.short_name) IN ('mdrrmo','pdrrmo') AND c.code IN ('ems','medical_transport','water_rescue','evacuation','disaster_coordination','debris_clearance','rescue')
ON CONFLICT DO NOTHING;

ALTER TABLE public.dispatch_recommendation_agencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dispatch_recommendation_agencies FROM anon;
GRANT SELECT ON TABLE public.dispatch_recommendation_agencies TO authenticated;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_capabilities' AND policyname='dispatch_capabilities_dispatch_staff_read') THEN
        CREATE POLICY dispatch_capabilities_dispatch_staff_read ON public.dispatch_capabilities
        FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('Admin','Chief','Desk Officer','Field Officer')));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agency_capabilities' AND policyname='agency_capabilities_dispatch_staff_read') THEN
        CREATE POLICY agency_capabilities_dispatch_staff_read ON public.agency_capabilities
        FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('Admin','Chief','Desk Officer','Field Officer')));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_recommendation_agencies' AND policyname='recommendation_agencies_dispatch_staff_read') THEN
        CREATE POLICY recommendation_agencies_dispatch_staff_read ON public.dispatch_recommendation_agencies
        FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('Admin','Chief','Desk Officer','Field Officer')));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.persist_ai_triage_bundle(
    p_incident_id UUID,
    p_assessment JSONB,
    p_recommendation JSONB,
    p_operational_snapshot JSONB DEFAULT '{}'::jsonb,
    p_model_metadata JSONB DEFAULT '{}'::jsonb,
    p_expires_at TIMESTAMPTZ DEFAULT now() + interval '5 minutes'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    assessment_id UUID;
    assessment_version INTEGER;
    recommendation_id UUID;
    recommendation_version INTEGER;
    primary_agency_id INTEGER;
    context JSONB;
    agency JSONB;
    capability TEXT;
    req_caps JSONB := COALESCE(p_recommendation->'required_capabilities', '[]'::jsonb);
    context_count INTEGER := 0;
BEGIN
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role is required'; END IF;

    SELECT COALESCE(MAX(assessment_version), 0) + 1 INTO assessment_version
    FROM public.incident_triage_assessments WHERE incident_id = p_incident_id;
    UPDATE public.incident_triage_assessments SET is_current = FALSE, updated_at = now()
    WHERE incident_id = p_incident_id AND is_current = TRUE;
    INSERT INTO public.incident_triage_assessments (
        incident_id, assessment_version, assessment_source, severity, urgency,
        evidence_confidence, dispatch_priority, evidence, missing_facts,
        contradictions, triggered_rules, model_metadata, rubric_version,
        rules_version, is_current
    ) VALUES (
        p_incident_id, assessment_version, 'ai',
        NULLIF(p_assessment->>'severity', '')::SMALLINT,
        NULLIF(p_assessment->>'urgency', ''),
        NULLIF(p_assessment->>'evidence_confidence', ''),
        NULLIF(p_assessment->>'dispatch_priority', '')::SMALLINT,
        COALESCE(p_assessment->'evidence','{}'::jsonb),
        COALESCE(p_assessment->'missing_facts','[]'::jsonb),
        COALESCE(p_assessment->'contradictions','[]'::jsonb),
        COALESCE(p_assessment->'triggered_rules','[]'::jsonb), p_model_metadata,
        p_assessment->>'rubric_version', p_assessment->>'rules_version', TRUE
    ) RETURNING id INTO assessment_id;

    SELECT id INTO primary_agency_id FROM public.agencies
    WHERE lower(short_name) = lower(COALESCE(p_recommendation->>'primary_agency','')) LIMIT 1;
    SELECT COALESCE(MAX(recommendation_version), 0) + 1 INTO recommendation_version
    FROM public.dispatch_recommendations WHERE incident_id = p_incident_id;
    INSERT INTO public.dispatch_recommendations (
        incident_id, triage_assessment_id, recommendation_version,
        state, planning_state, planning_error, dispatch_priority,
        primary_agency_id, required_capabilities, reason_codes,
        operational_snapshot, expires_at, emergency_state, routing_state
    ) VALUES (
        p_incident_id, assessment_id, recommendation_version,
        CASE WHEN COALESCE(p_recommendation->>'planning_state','needs_review') = 'ready' THEN 'ready' ELSE 'needs_review' END,
        COALESCE(p_recommendation->>'planning_state','needs_review'),
        p_recommendation->>'planning_error',
        NULLIF(p_recommendation->>'dispatch_priority','')::SMALLINT,
        primary_agency_id, req_caps, COALESCE(p_recommendation->'reason_codes','[]'::jsonb),
        COALESCE(p_operational_snapshot,'{}'::jsonb), p_expires_at,
        p_recommendation->>'emergency_state', p_recommendation->>'routing_state'
    ) RETURNING id INTO recommendation_id;

    FOR capability IN SELECT jsonb_array_elements_text(req_caps) LOOP
        INSERT INTO public.dispatch_requirements(recommendation_id, capability_code, source_evidence)
        VALUES (recommendation_id, capability, jsonb_build_object('source','deterministic_triage'))
        ON CONFLICT (recommendation_id, capability_code) DO NOTHING;
    END LOOP;

    FOR agency IN SELECT jsonb_array_elements(COALESCE(p_recommendation->'suggested_agencies','[]'::jsonb)) LOOP
        INSERT INTO public.dispatch_recommendation_agencies(recommendation_id, agency_id, role, rank, reason_codes)
        SELECT recommendation_id, a.id, COALESCE(agency->>'role','support'),
               COALESCE((agency->>'rank')::INTEGER, 1), COALESCE(agency->'reason_codes','[]'::jsonb)
        FROM public.agencies a WHERE lower(a.short_name)=lower(agency->>'agency_code')
        ON CONFLICT (recommendation_id, agency_id) DO NOTHING;
    END LOOP;

    FOR context IN SELECT jsonb_array_elements(COALESCE(p_operational_snapshot->'contexts','[]'::jsonb)) LOOP
        IF COALESCE((context->>'available_officers')::INTEGER,0) + COALESCE((context->>'available_resources')::INTEGER,0) > 0
           AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(req_caps) required(code)
               WHERE NOT EXISTS (
                   SELECT 1 FROM public.agency_capabilities ac
                   WHERE ac.agency_id = NULLIF(context->>'agency_id','')::INTEGER
                     AND ac.capability_code = required.code
               )
           ) THEN
            INSERT INTO public.dispatch_candidates(
                recommendation_id, station_id, agency_id, rank, eligible,
                distance_meters, score, capability_coverage, score_components,
                rejection_reasons, data_as_of
            ) VALUES (
                recommendation_id, NULLIF(context->>'station_id','')::INTEGER,
                NULLIF(context->>'agency_id','')::INTEGER, context_count + 1, TRUE,
                NULLIF(context->>'distance_meters','')::NUMERIC, NULL,
                jsonb_build_object('required', req_caps, 'validated_in_database', TRUE),
                '{}'::jsonb, '[]'::jsonb, NULLIF(context->>'operational_data_as_of','')::TIMESTAMPTZ
            );
            context_count := context_count + 1;
        END IF;
    END LOOP;

    IF COALESCE(p_recommendation->>'routing_state','held_for_review') <> 'suggested'
       OR (context_count = 0 AND jsonb_array_length(req_caps) > 0) THEN
        UPDATE public.dispatch_recommendations
        SET state = 'needs_review', planning_state = 'needs_review',
            planning_error = CASE
                WHEN COALESCE(p_recommendation->>'routing_state','held_for_review') <> 'suggested'
                    THEN 'Agency routing is unresolved and requires dispatcher review.'
                ELSE 'No available station passed mandatory capability coverage.'
            END
        WHERE id = recommendation_id;
    END IF;

    RETURN jsonb_build_object('assessment_id', assessment_id, 'recommendation_id', recommendation_id, 'candidate_count', context_count);
END $$;

REVOKE ALL ON FUNCTION public.persist_ai_triage_bundle(UUID, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_ai_triage_bundle(UUID, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
