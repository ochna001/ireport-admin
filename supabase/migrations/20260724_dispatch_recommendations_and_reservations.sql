-- Recommendation snapshots and atomic human-approved reservations.
-- No caller can use this migration to autonomously dispatch: the approval
-- function requires a dispatch-staff profile and an explicit approver ID.

CREATE TABLE IF NOT EXISTS public.dispatch_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    triage_assessment_id UUID REFERENCES public.incident_triage_assessments(id),
    recommendation_version INTEGER NOT NULL DEFAULT 1 CHECK (recommendation_version > 0),
    state TEXT NOT NULL DEFAULT 'ready'
        CHECK (state IN ('ready', 'approved', 'revised', 'rejected', 'expired')),
    dispatch_priority SMALLINT CHECK (dispatch_priority BETWEEN 1 AND 5),
    primary_agency_id INTEGER REFERENCES public.agencies(id),
    required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    operational_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, recommendation_version),
    CHECK (jsonb_typeof(required_capabilities) = 'array'),
    CHECK (jsonb_typeof(reason_codes) = 'array'),
    CHECK (jsonb_typeof(operational_snapshot) = 'object')
);

CREATE TABLE IF NOT EXISTS public.dispatch_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES public.dispatch_recommendations(id) ON DELETE CASCADE,
    station_id INTEGER REFERENCES public.agency_stations(id),
    agency_id INTEGER REFERENCES public.agencies(id),
    rank INTEGER NOT NULL CHECK (rank > 0),
    eligible BOOLEAN NOT NULL DEFAULT TRUE,
    eta_seconds INTEGER CHECK (eta_seconds IS NULL OR eta_seconds >= 0),
    distance_meters NUMERIC CHECK (distance_meters IS NULL OR distance_meters >= 0),
    score NUMERIC CHECK (score IS NULL OR score BETWEEN 0 AND 1),
    capability_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_components JSONB NOT NULL DEFAULT '{}'::jsonb,
    rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_as_of TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(capability_coverage) = 'object'),
    CHECK (jsonb_typeof(score_components) = 'object'),
    CHECK (jsonb_typeof(rejection_reasons) = 'array')
);

CREATE TABLE IF NOT EXISTS public.dispatch_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES public.dispatch_recommendations(id) ON DELETE CASCADE,
    capability_code TEXT NOT NULL,
    minimum_count INTEGER NOT NULL DEFAULT 1 CHECK (minimum_count > 0),
    mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    source_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (recommendation_id, capability_code)
);

CREATE TABLE IF NOT EXISTS public.resource_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES public.dispatch_recommendations(id),
    resource_id INTEGER NOT NULL REFERENCES public.agency_resources(id),
    state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'released', 'expired', 'cancelled')),
    reserved_by UUID REFERENCES auth.users(id),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_reservations_one_active
    ON public.resource_reservations(resource_id)
    WHERE state = 'active';

CREATE TABLE IF NOT EXISTS public.dispatch_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES public.dispatch_recommendations(id),
    action TEXT NOT NULL CHECK (action IN ('approve', 'revise', 'reject', 'cancel', 'override')),
    dispatcher_id UUID REFERENCES auth.users(id),
    original_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    final_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_recommendations_incident
    ON public.dispatch_recommendations(incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_candidates_recommendation
    ON public.dispatch_candidates(recommendation_id, rank);

DO $$
DECLARE
    table_name TEXT;
    policy_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'dispatch_recommendations',
        'dispatch_candidates',
        'dispatch_requirements',
        'resource_reservations',
        'dispatch_decisions'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
        policy_name := table_name || '_dispatch_staff_read';
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN (''Admin'', ''Chief'', ''Desk Officer'', ''Field Officer'')))',
                policy_name, table_name
            );
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_dispatch_recommendation(
    p_recommendation_id UUID,
    p_incident_id UUID,
    p_station_id INTEGER,
    p_officer_ids UUID[] DEFAULT ARRAY[]::UUID[],
    p_resource_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    p_approved_by UUID DEFAULT NULL,
    p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recommendation_row public.dispatch_recommendations%ROWTYPE;
    incident_row public.incidents%ROWTYPE;
    station_agency_short_name TEXT;
    station_agency_id INTEGER;
    requested_resources INTEGER[] := COALESCE(p_resource_ids, ARRAY[]::INTEGER[]);
    requested_officers UUID[] := COALESCE(p_officer_ids, ARRAY[]::UUID[]);
    available_resource_count INTEGER;
    available_officer_count INTEGER;
BEGIN
    IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_approved_by THEN
        RAISE EXCEPTION 'Approval identity must match the authenticated dispatcher';
    END IF;

    IF p_approved_by IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_approved_by
          AND p.role IN ('Admin', 'Chief', 'Desk Officer')
    ) THEN
        RAISE EXCEPTION 'A verified dispatch-staff approver is required';
    END IF;

    SELECT * INTO recommendation_row
    FROM public.dispatch_recommendations
    WHERE id = p_recommendation_id AND incident_id = p_incident_id
    FOR UPDATE;

    IF recommendation_row.id IS NULL THEN
        RAISE EXCEPTION 'Dispatch recommendation not found';
    END IF;
    IF recommendation_row.state NOT IN ('ready', 'revised') THEN
        RAISE EXCEPTION 'Dispatch recommendation is not awaiting approval';
    END IF;
    IF recommendation_row.expires_at IS NOT NULL AND recommendation_row.expires_at < now() THEN
        UPDATE public.dispatch_recommendations SET state = 'expired', updated_at = now()
        WHERE id = p_recommendation_id;
        RAISE EXCEPTION 'Dispatch recommendation has expired';
    END IF;

    SELECT * INTO incident_row
    FROM public.incidents
    WHERE id = p_incident_id
    FOR UPDATE;

    IF incident_row.id IS NULL THEN
        RAISE EXCEPTION 'Incident not found';
    END IF;
    IF incident_row.status IN ('resolved', 'closed', 'rejected') THEN
        RAISE EXCEPTION 'Cannot dispatch a terminal incident';
    END IF;
    IF p_station_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.agency_stations WHERE id = p_station_id
    ) THEN
        RAISE EXCEPTION 'A valid station is required';
    END IF;

    SELECT lower(trim(a.short_name)), a.id INTO station_agency_short_name, station_agency_id
    FROM public.agency_stations s
    JOIN public.agencies a ON a.id = s.agency_id
    WHERE s.id = p_station_id;

    SELECT COUNT(*) INTO available_resource_count
    FROM (
        SELECT r.id
        FROM public.agency_resources r
        WHERE r.id = ANY(requested_resources) AND r.status = 'available'
        FOR UPDATE
    ) locked_resources;
    IF available_resource_count <> cardinality(requested_resources) THEN
        RAISE EXCEPTION 'One or more selected resources are no longer available';
    END IF;

    SELECT COUNT(*) INTO available_officer_count
    FROM (
        SELECT p.id
        FROM public.profiles p
        WHERE p.id = ANY(requested_officers) AND p.status = 'available'
        FOR UPDATE
    ) locked_officers;
    IF available_officer_count <> cardinality(requested_officers) THEN
        RAISE EXCEPTION 'One or more selected officers are no longer available';
    END IF;

    IF cardinality(requested_resources) > 0 THEN
        INSERT INTO public.resource_reservations (
            incident_id, recommendation_id, resource_id, reserved_by
        )
        SELECT p_incident_id, p_recommendation_id, resource_id, p_approved_by
        FROM unnest(requested_resources) AS resource_id;

        UPDATE public.agency_resources
        SET status = 'deployed', updated_at = now()
        WHERE id = ANY(requested_resources);
    END IF;

    IF cardinality(requested_officers) > 0 THEN
        UPDATE public.profiles
        SET status = 'busy'
        WHERE id = ANY(requested_officers);
    END IF;

    UPDATE public.incidents
    SET assigned_station_id = p_station_id,
        assigned_officer_ids = requested_officers,
        assigned_officer_id = requested_officers[1],
        assigned_resource_ids = requested_resources,
        agency_type = COALESCE(station_agency_short_name, agency_type),
        status = 'assigned',
        updated_at = now()
    WHERE id = p_incident_id;

    INSERT INTO public.incident_assignment_history (
        incident_id, from_status, to_status, previous_station_id, new_station_id,
        previous_officer_ids, new_officer_ids, previous_resource_ids,
        new_resource_ids, agency_ids, reason, changed_by, notes
    ) VALUES (
        p_incident_id, incident_row.status, 'assigned', incident_row.assigned_station_id,
        p_station_id, COALESCE(incident_row.assigned_officer_ids, ARRAY[]::UUID[]),
        requested_officers, COALESCE(incident_row.assigned_resource_ids, ARRAY[]::INTEGER[]),
        requested_resources, ARRAY[station_agency_id], 'human_approved_dispatch',
        p_approved_by, p_override_reason
    );

    UPDATE public.dispatch_recommendations
    SET state = 'approved', approved_by = p_approved_by, approved_at = now(),
        override_reason = p_override_reason, updated_at = now()
    WHERE id = p_recommendation_id;

    INSERT INTO public.dispatch_decisions (
        incident_id, recommendation_id, action, dispatcher_id,
        final_values, reason
    ) VALUES (
        p_incident_id, p_recommendation_id, 'approve', p_approved_by,
        jsonb_build_object(
            'station_id', p_station_id,
            'officer_ids', requested_officers,
            'resource_ids', requested_resources
        ), p_override_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'incident_id', p_incident_id,
        'recommendation_id', p_recommendation_id,
        'station_id', p_station_id,
        'resource_ids', requested_resources,
        'officer_ids', requested_officers
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_dispatch_recommendation(UUID, UUID, INTEGER, UUID[], INTEGER[], UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_dispatch_recommendation(UUID, UUID, INTEGER, UUID[], INTEGER[], UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_dispatch_recommendation(UUID, UUID, INTEGER, UUID[], INTEGER[], UUID, TEXT) TO service_role;
