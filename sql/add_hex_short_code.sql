-- ============================================================================
-- Add Hex Short Code for Easy Incident Search
-- ============================================================================
-- This creates a short_code column using first 4-6 hex chars of UUID
-- Examples: #1f2a, #a3b4, #9c7d
-- ============================================================================

-- Step 1: Add short_code column (computed from UUID)
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS short_code text GENERATED ALWAYS AS (
  LOWER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 4))
) STORED;

-- Step 2: Create index on short_code for fast lookup
CREATE INDEX IF NOT EXISTS incidents_short_code_idx ON incidents(short_code);

-- Step 3: Update search_vector to include short_code
DROP TRIGGER IF EXISTS incidents_search_vector_trigger ON incidents;

CREATE OR REPLACE FUNCTION incidents_search_vector_update() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    -- Weight A: Most important fields (including short_code)
    setweight(to_tsvector('english', COALESCE(NEW.short_code, '')), 'A') ||
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

-- Step 4: Update search_vector for existing rows to include short_code
UPDATE incidents SET search_vector = 
  setweight(to_tsvector('english', COALESCE(short_code, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(agency_type, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(reporter_name, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_address, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI'), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(status, '')), 'C');

-- Step 5: Verify short codes
SELECT 
  short_code,
  id,
  agency_type,
  LEFT(description, 50) as description_preview
FROM incidents
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- Now you can search by:
-- - #1f2a (with #)
-- - 1f2a (without #)
-- - Full UUID
-- ============================================================================

-- Note: short_code is auto-generated from UUID, so it's always consistent
-- and doesn't require manual management
