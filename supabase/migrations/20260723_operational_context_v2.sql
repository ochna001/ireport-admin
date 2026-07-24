-- Return identifier-rich, station-level operational context.
-- This remains advisory context; it does not assign or reserve anything.

DROP FUNCTION IF EXISTS public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC);

CREATE FUNCTION public.get_nearby_operational_context(
    target_lat NUMERIC,
    target_lon NUMERIC,
    radius_km NUMERIC DEFAULT 5
)
RETURNS TABLE (
    station_id INTEGER,
    agency_id INTEGER,
    station_name TEXT,
    agency_name TEXT,
    distance_meters NUMERIC,
    available_officers BIGINT,
    available_resources BIGINT,
    available_resource_ids INTEGER[],
    operational_data_as_of TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        s.id AS station_id,
        a.id AS agency_id,
        s.name AS station_name,
        a.name AS agency_name,
        distance.distance_meters,
        (
            SELECT COUNT(*)
            FROM public.profiles p
            WHERE p.station_id = s.id
              AND p.agency_id = a.id
              AND p.role = 'Field Officer'
              AND p.status = 'available'
        ) AS available_officers,
        (
            SELECT COUNT(*)
            FROM public.agency_resources r
            WHERE r.station_id = s.id
              AND r.status = 'available'
        ) AS available_resources,
        COALESCE((
            SELECT ARRAY_AGG(r.id ORDER BY r.id)
            FROM public.agency_resources r
            WHERE r.station_id = s.id
              AND r.status = 'available'
        ), ARRAY[]::INTEGER[]) AS available_resource_ids,
        NOW() AS operational_data_as_of
    FROM public.agency_stations s
    JOIN public.agencies a ON a.id = s.agency_id
    CROSS JOIN LATERAL (
        SELECT (6371000 * ACOS(LEAST(1.0, GREATEST(-1.0,
            COS(RADIANS(target_lat)) * COS(RADIANS(s.latitude)) *
            COS(RADIANS(s.longitude) - RADIANS(target_lon)) +
            SIN(RADIANS(target_lat)) * SIN(RADIANS(s.latitude))
        ))))::NUMERIC AS distance_meters
    ) distance
    WHERE distance.distance_meters <= radius_km * 1000
    ORDER BY distance.distance_meters ASC
    LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_operational_context(NUMERIC, NUMERIC, NUMERIC) TO service_role;
