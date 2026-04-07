-- ============================================================================
-- Full-Text Search Implementation for Incidents Table
-- ============================================================================
-- This migration adds a search_vector column with GIN indexing for fast
-- full-text search across multiple fields in the incidents table.
--
-- Run this in Supabase SQL Editor or via psql
-- ============================================================================

-- Step 1: Add search_vector column
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Step 2: Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS incidents_search_idx 
ON incidents USING GIN(search_vector);

-- Step 3: Create function to update search vector
CREATE OR REPLACE FUNCTION incidents_search_vector_update() 
RETURNS TRIGGER AS $$
BEGIN
  -- Build search vector with weighted fields
  -- Weight A (highest): ID, agency_type
  -- Weight B (high): description, reporter_name
  -- Weight C (medium): location_address, created_at, status
  
  NEW.search_vector := 
    -- Weight A: Most important fields
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

-- Step 4: Create trigger to auto-update search vector on INSERT/UPDATE
DROP TRIGGER IF EXISTS incidents_search_vector_trigger ON incidents;

CREATE TRIGGER incidents_search_vector_trigger
BEFORE INSERT OR UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION incidents_search_vector_update();

-- Step 5: Populate search_vector for existing rows
UPDATE incidents SET search_vector = 
  setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(agency_type, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(reporter_name, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_address, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI'), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(status, '')), 'C')
WHERE search_vector IS NULL;

-- Step 6: Verify the migration
-- Run this to check if everything is set up correctly:
SELECT 
  COUNT(*) as total_incidents,
  COUNT(search_vector) as incidents_with_search_vector,
  COUNT(*) - COUNT(search_vector) as missing_search_vectors
FROM incidents;

-- Step 7: Test search functionality
-- Example queries to test:
-- 
-- Search by ID (partial):
-- SELECT * FROM incidents WHERE search_vector @@ to_tsquery('english', '550e8400:*');
--
-- Search by agency:
-- SELECT * FROM incidents WHERE search_vector @@ to_tsquery('english', 'PNP | BFP');
--
-- Search by description:
-- SELECT * FROM incidents WHERE search_vector @@ websearch_to_tsquery('english', 'fire incident');
--
-- Ranked search:
-- SELECT *, ts_rank(search_vector, websearch_to_tsquery('english', 'fire')) as rank
-- FROM incidents 
-- WHERE search_vector @@ websearch_to_tsquery('english', 'fire')
-- ORDER BY rank DESC;

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- The incidents table now has full-text search capabilities.
-- Next step: Update the backend code to use this search functionality.
-- ============================================================================
