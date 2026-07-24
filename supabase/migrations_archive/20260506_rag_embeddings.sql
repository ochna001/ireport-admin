-- ============================================================================
-- RAG-Enhanced AI Triage: Embeddings & Context Retrieval
-- ============================================================================

-- Step 1: Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create incident_embeddings table for storing text embeddings
CREATE TABLE IF NOT EXISTS public.incident_embeddings (
    incident_id UUID PRIMARY KEY REFERENCES public.incidents(id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Step 3: Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS incident_embeddings_hnsw_idx 
ON public.incident_embeddings USING hnsw (embedding vector_cosine_ops);

-- Step 4: Add rag_context to incident_ai_reports for transparency/debugging
ALTER TABLE public.incident_ai_reports 
ADD COLUMN IF NOT EXISTS rag_context JSONB DEFAULT NULL;

-- Step 5: Create RPC function to retrieve similar incidents
-- Filters: past 4 months, within 200m radius, ranks by cosine similarity
CREATE OR REPLACE FUNCTION public.get_similar_incidents(
    target_embedding VECTOR(384),
    target_lat NUMERIC,
    target_lon NUMERIC,
    target_date TIMESTAMP WITH TIME ZONE,
    radius_meters NUMERIC DEFAULT 200,
    max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    description TEXT,
    location_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    status TEXT,
    ai_summary TEXT,
    distance_meters NUMERIC,
    similarity NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    four_months_ago TIMESTAMP WITH TIME ZONE;
BEGIN
    four_months_ago := target_date - INTERVAL '4 months';
    
    RETURN QUERY
    SELECT 
        i.id,
        i.description,
        i.location_address,
        i.created_at,
        i.status,
        COALESCE(air.summary, '') AS ai_summary,
        -- Haversine distance in meters
        (6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
                cos(radians(target_lat)) * cos(radians(i.latitude)) *
                cos(radians(i.longitude) - radians(target_lon)) +
                sin(radians(target_lat)) * sin(radians(i.latitude))
            ))
        ))::NUMERIC AS distance_meters,
        -- Cosine similarity (1 - distance)
        (1 - (ie.embedding <=> target_embedding))::NUMERIC AS similarity
    FROM public.incidents i
    INNER JOIN public.incident_embeddings ie ON ie.incident_id = i.id
    LEFT JOIN public.incident_ai_reports air ON air.incident_id = i.id
    WHERE 
        -- Time filter: past 4 months relative to target_date
        i.created_at >= four_months_ago
        AND i.created_at <= target_date
        -- Geo filter: within radius_meters
        AND (6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
                cos(radians(target_lat)) * cos(radians(i.latitude)) *
                cos(radians(i.longitude) - radians(target_lon)) +
                sin(radians(target_lat)) * sin(radians(i.latitude))
            ))
        )) <= radius_meters
    ORDER BY 
        ie.embedding <=> target_embedding ASC,  -- closest vectors first
        distance_meters ASC
    LIMIT max_results;
END;
$$;

-- Step 6: Create helper function to get nearby operational capacity
CREATE OR REPLACE FUNCTION public.get_nearby_operational_context(
    target_lat NUMERIC,
    target_lon NUMERIC,
    radius_km NUMERIC DEFAULT 5
)
RETURNS TABLE (
    station_name TEXT,
    agency_name TEXT,
    distance_meters NUMERIC,
    available_officers BIGINT,
    available_resources BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.name AS station_name,
        a.name AS agency_name,
        (6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
                cos(radians(target_lat)) * cos(radians(s.latitude)) *
                cos(radians(s.longitude) - radians(target_lon)) +
                sin(radians(target_lat)) * sin(radians(s.latitude))
            ))
        ))::NUMERIC AS distance_meters,
        COUNT(DISTINCT p.id) FILTER (WHERE p.role = 'Field Officer') AS available_officers,
        COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'available') AS available_resources
    FROM public.agency_stations s
    JOIN public.agencies a ON a.id = s.agency_id
    LEFT JOIN public.profiles p ON p.agency_id = a.id
    LEFT JOIN public.agency_resources r ON r.station_id = s.id
    WHERE 
        (6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
                cos(radians(target_lat)) * cos(radians(s.latitude)) *
                cos(radians(s.longitude) - radians(target_lon)) +
                sin(radians(target_lat)) * sin(radians(s.latitude))
            ))
        )) <= radius_km * 1000
    GROUP BY s.id, s.name, a.name, s.latitude, s.longitude
    ORDER BY distance_meters ASC
    LIMIT 10;
END;
$$;

-- Step 7: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_similar_incidents TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_similar_incidents TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_operational_context TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_operational_context TO service_role;

-- Step 8: Update RLS policy for incident_embeddings (service role can manage, read for all)
ALTER TABLE public.incident_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all on incident_embeddings" 
ON public.incident_embeddings FOR SELECT USING (true);

CREATE POLICY "Enable insert/update for service role on incident_embeddings" 
ON public.incident_embeddings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Migration Complete!
-- ============================================================================
