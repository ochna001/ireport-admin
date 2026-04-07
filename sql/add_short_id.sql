-- ============================================================================
-- Add Short ID for Easy Incident Search
-- ============================================================================
-- This adds a sequential short_id column (e.g., #1, #2, #3) that's easier
-- to remember and search than full UUIDs.
-- ============================================================================

-- Step 1: Add short_id column
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS short_id SERIAL;

-- Step 2: Create unique index on short_id
CREATE UNIQUE INDEX IF NOT EXISTS incidents_short_id_idx ON incidents(short_id);

-- Step 3: Update search_vector to include short_id
DROP TRIGGER IF EXISTS incidents_search_vector_trigger ON incidents;

CREATE OR REPLACE FUNCTION incidents_search_vector_update() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    -- Weight A: Most important fields (including short_id)
    setweight(to_tsvector('english', COALESCE(NEW.short_id::text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.id::text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.agency_type, '')), 'A') ||
    
    -- Weight B: Important content fields
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.reporter_name, '')), 'B') ||
    
    -- Weight C: Supporting fields
    setweight(to_tsvector('english', COALESCE(NEW.location_address, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(to_char(NEW.created_at, 'YYYY-MM-DD HH24:MI'), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.status, '')), 'C');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incidents_search_vector_trigger
BEFORE INSERT OR UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION incidents_search_vector_update();

-- Step 4: Update search_vector for existing rows to include short_id
UPDATE incidents SET search_vector = 
  setweight(to_tsvector('english', COALESCE(short_id::text, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(agency_type, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(reporter_name, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_address, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI'), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(status, '')), 'C');

-- Step 5: Verify
SELECT 
  short_id,
  LEFT(id::text, 8) as uuid_prefix,
  agency_type,
  description
FROM incidents
ORDER BY short_id DESC
LIMIT 10;

-- ============================================================================
-- Now you can search by:
-- - #1, #2, #3 (short_id)
-- - 1, 2, 3 (without #)
-- - Full UUID
-- - Partial UUID
-- ============================================================================
