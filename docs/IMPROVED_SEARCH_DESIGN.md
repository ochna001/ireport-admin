# Improved Search System Design

## Current Situation

The current search implementation has limitations:
- Only searches `description` and `reporter_name` fields
- Requires exact UUID match for ID search
- No indexing for performance optimization
- Limited to text-based pattern matching

## Proposed Solution: Full-Text Search with PostgreSQL

### 1. Database Schema Changes

#### Add Search Vector Column to `incidents` Table

```sql
-- Add tsvector column for full-text search
ALTER TABLE incidents 
ADD COLUMN search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX incidents_search_idx ON incidents USING GIN(search_vector);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION incidents_search_vector_update() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.id::text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.agency_type, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.reporter_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.location_address, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(to_char(NEW.created_at, 'YYYY-MM-DD'), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.status, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search vector
CREATE TRIGGER incidents_search_vector_trigger
BEFORE INSERT OR UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION incidents_search_vector_update();

-- Populate existing rows
UPDATE incidents SET search_vector = 
  setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(agency_type, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(reporter_name, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_address, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(to_char(created_at, 'YYYY-MM-DD'), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(status, '')), 'C');
```

### 2. Search Weight Priority

**A (Highest)**: 
- `id` - Incident ID (UUID)
- `agency_type` - PNP, BFP, PDRRMO, etc.

**B (High)**:
- `description` - Main incident description
- `reporter_name` - Person who reported

**C (Medium)**:
- `location_address` - Where incident occurred
- `created_at` - Date of incident (formatted as YYYY-MM-DD)
- `status` - pending, assigned, in_progress, etc.

### 3. Backend Implementation

Update `db:getIncidents` handler in `src/main/index.ts`:

```typescript
// Replace current search implementation
if (filters.search) {
  const searchTerm = sanitize(filters.search);
  console.log('[Admin] Searching incidents for:', searchTerm);

  // Use full-text search with ranking
  query = query
    .textSearch('search_vector', searchTerm, {
      type: 'websearch',
      config: 'english'
    })
    .order('ts_rank(search_vector, websearch_to_tsquery(\'english\', $1))', { 
      ascending: false,
      foreignTable: undefined,
      referencedTable: undefined
    });
}
```

### 4. Search Features

#### Supported Search Queries

**Exact ID Match**:
```
550e8400-e29b-41d4-a916-446655440000
```

**Partial ID Match** (first 8 characters):
```
550e8400
```

**Agency Search**:
```
PNP
BFP
PDRRMO
```

**Date Search**:
```
2024-12-20
December 20
2024-12
```

**Status Search**:
```
pending
in progress
resolved
```

**Description/Reporter Search**:
```
fire incident
john doe
```

**Location Search**:
```
Daet
Basud
Barangay 1
```

**Combined Search** (AND logic):
```
fire Daet
PNP pending
```

**Phrase Search**:
```
"house fire"
"medical emergency"
```

### 5. Performance Benefits

**Before (Current)**:
- Sequential scan through all rows
- No indexing
- Slow for large datasets
- Limited to 2 fields

**After (Proposed)**:
- GIN index for instant lookups
- Ranked results (most relevant first)
- Searches across 7 fields
- Handles typos and variations
- Supports phrase matching

### 6. Alternative: Simple Keyword Column

If full-text search is too complex, a simpler approach:

```sql
-- Add keywords column
ALTER TABLE incidents 
ADD COLUMN search_keywords text;

-- Create index
CREATE INDEX incidents_keywords_idx ON incidents (search_keywords);

-- Update function
CREATE OR REPLACE FUNCTION incidents_keywords_update() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_keywords := LOWER(
    COALESCE(NEW.id::text, '') || ' ' ||
    COALESCE(NEW.agency_type, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.reporter_name, '') || ' ' ||
    COALESCE(NEW.location_address, '') || ' ' ||
    COALESCE(to_char(NEW.created_at, 'YYYY-MM-DD'), '') || ' ' ||
    COALESCE(NEW.status, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Search query
SELECT * FROM incidents 
WHERE search_keywords ILIKE '%search_term%'
ORDER BY created_at DESC;
```

**Pros**: Simpler to implement
**Cons**: No ranking, slower than GIN index, no phrase matching

### 7. Migration Steps

1. **Backup Database**
   ```bash
   pg_dump ireport_db > backup_before_search.sql
   ```

2. **Run Migration SQL**
   - Execute the search vector setup SQL
   - Populate existing rows
   - Test search functionality

3. **Update Backend Code**
   - Modify `db:getIncidents` handler
   - Add search ranking
   - Test with various queries

4. **Frontend Updates** (Optional)
   - Add search suggestions
   - Show search result count
   - Highlight matching terms

### 8. Testing Checklist

- [ ] Search by full UUID
- [ ] Search by partial UUID (first 8 chars)
- [ ] Search by agency (PNP, BFP, PDRRMO)
- [ ] Search by date (YYYY-MM-DD)
- [ ] Search by status
- [ ] Search by description keywords
- [ ] Search by reporter name
- [ ] Search by location
- [ ] Combined search (multiple terms)
- [ ] Phrase search ("exact match")
- [ ] Performance test with 1000+ incidents

### 9. Future Enhancements

**Autocomplete/Suggestions**:
```typescript
// Get top 5 matching incidents as suggestions
const suggestions = await supabase
  .from('incidents')
  .select('id, description, agency_type')
  .textSearch('search_vector', searchTerm)
  .limit(5);
```

**Search Analytics**:
- Track popular search terms
- Identify search patterns
- Improve search relevance

**Fuzzy Matching**:
- Handle typos (e.g., "fir" → "fire")
- Phonetic matching
- Stemming (e.g., "fires" → "fire")

## Recommendation

**Use Full-Text Search (tsvector + GIN index)** for:
- ✅ Better performance
- ✅ Ranked results
- ✅ Multi-field search
- ✅ PostgreSQL native support
- ✅ Scalable to 10,000+ incidents

This approach is **production-ready** and used by major applications for search functionality.
