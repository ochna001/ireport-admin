# Deploying the Full-Text Search Feature

## Overview

This guide walks you through deploying the improved search functionality that enables searching across multiple fields (ID, agency, description, reporter, location, date, status) with PostgreSQL full-text search.

## Prerequisites

- Access to Supabase SQL Editor
- Admin access to the database
- Backup of current database (recommended)

## Deployment Steps

### Step 1: Backup Database (Recommended)

Before making any changes, create a backup:

1. Go to Supabase Dashboard → Database → Backups
2. Create a manual backup
3. Wait for backup to complete

### Step 2: Run SQL Migration

1. Open Supabase SQL Editor
2. Copy the contents of `sql/add_search_vector.sql`
3. Paste into SQL Editor
4. Click "Run" to execute

**Expected Output:**
```
ALTER TABLE
CREATE INDEX
CREATE FUNCTION
CREATE TRIGGER
UPDATE [number of rows]
```

### Step 3: Verify Migration

Run this query to verify the migration succeeded:

```sql
SELECT 
  COUNT(*) as total_incidents,
  COUNT(search_vector) as incidents_with_search_vector,
  COUNT(*) - COUNT(search_vector) as missing_search_vectors
FROM incidents;
```

**Expected Result:**
- `total_incidents`: Total number of incidents in your database
- `incidents_with_search_vector`: Should equal `total_incidents`
- `missing_search_vectors`: Should be `0`

If `missing_search_vectors` is not 0, run:

```sql
UPDATE incidents SET search_vector = 
  setweight(to_tsvector('english', COALESCE(id::text, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(agency_type, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(reporter_name, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_address, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI'), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(status, '')), 'C')
WHERE search_vector IS NULL;
```

### Step 4: Test Search in Database

Test the search functionality directly in SQL:

```sql
-- Test 1: Search by agency
SELECT id, agency_type, description 
FROM incidents 
WHERE search_vector @@ websearch_to_tsquery('english', 'PNP')
LIMIT 5;

-- Test 2: Search by description
SELECT id, agency_type, description 
FROM incidents 
WHERE search_vector @@ websearch_to_tsquery('english', 'fire incident')
LIMIT 5;

-- Test 3: Search by location
SELECT id, location_address, description 
FROM incidents 
WHERE search_vector @@ websearch_to_tsquery('english', 'Daet')
LIMIT 5;

-- Test 4: Ranked search (most relevant first)
SELECT 
  id, 
  agency_type, 
  description,
  ts_rank(search_vector, websearch_to_tsquery('english', 'fire')) as relevance
FROM incidents 
WHERE search_vector @@ websearch_to_tsquery('english', 'fire')
ORDER BY relevance DESC
LIMIT 10;
```

### Step 5: Restart Application

The backend code has already been updated to use full-text search. Simply restart the application:

```bash
# In the ireport-admin directory
npm run dev
```

### Step 6: Test Search in Application

Test various search queries in the Incidents page search box:

**Test Cases:**

1. **Full UUID Search**
   - Input: `550e8400-e29b-41d4-a916-446655440000` (use an actual incident ID)
   - Expected: Exact match for that incident

2. **Partial UUID Search**
   - Input: First 8-12 characters of an incident ID
   - Expected: Incidents starting with those characters

3. **Agency Search**
   - Input: `PNP`, `BFP`, or `PDRRMO`
   - Expected: All incidents from that agency

4. **Date Search**
   - Input: `2024-12-20` or `December 20`
   - Expected: Incidents from that date

5. **Status Search**
   - Input: `pending`, `in progress`, `resolved`
   - Expected: Incidents with that status

6. **Description Search**
   - Input: `fire`, `accident`, `emergency`
   - Expected: Incidents with those keywords in description

7. **Location Search**
   - Input: `Daet`, `Basud`, `Barangay 1`
   - Expected: Incidents from those locations

8. **Combined Search**
   - Input: `fire Daet` (searches for both terms)
   - Expected: Fire incidents in Daet

9. **Phrase Search**
   - Input: `"house fire"` (exact phrase)
   - Expected: Incidents with exact phrase "house fire"

## How It Works

### Search Priority (Ranking)

Results are ranked by relevance using these weights:

**Weight A (Highest Priority)**:
- Incident ID
- Agency Type

**Weight B (High Priority)**:
- Description
- Reporter Name

**Weight C (Medium Priority)**:
- Location Address
- Created Date
- Status

### Search Types Supported

1. **Simple Terms**: `fire` - matches any field containing "fire"
2. **Multiple Terms**: `fire daet` - matches incidents with both terms (AND logic)
3. **Phrase Search**: `"house fire"` - exact phrase match
4. **OR Search**: `fire | water` - matches either term
5. **NOT Search**: `fire -false` - matches "fire" but not "false alarm"

### Automatic Updates

The search index updates automatically when:
- New incidents are created
- Existing incidents are updated
- Any searchable field changes

No manual reindexing needed!

## Performance

### Before (Old Search)
- Sequential scan through all rows
- Only searched 2 fields (description, reporter_name)
- Slow with 1000+ incidents
- No ranking

### After (Full-Text Search)
- GIN index for instant lookups
- Searches 7 fields simultaneously
- Fast even with 10,000+ incidents
- Results ranked by relevance
- Handles typos and variations

## Troubleshooting

### Issue: Search returns no results

**Solution 1**: Check if search_vector is populated
```sql
SELECT COUNT(*) FROM incidents WHERE search_vector IS NOT NULL;
```

If count is 0, run the UPDATE query from Step 3.

**Solution 2**: Check if GIN index exists
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'incidents';
```

Should show `incidents_search_idx`. If missing, run:
```sql
CREATE INDEX incidents_search_idx ON incidents USING GIN(search_vector);
```

### Issue: Search is slow

**Solution**: Rebuild the GIN index
```sql
REINDEX INDEX incidents_search_idx;
```

### Issue: New incidents not searchable

**Solution**: Check if trigger exists
```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'incidents'::regclass;
```

Should show `incidents_search_vector_trigger`. If missing, run the CREATE TRIGGER command from the migration file.

### Issue: Application shows error

**Solution**: Check application logs for details. The code includes a fallback to ILIKE search if full-text search fails.

## Rollback (If Needed)

If you need to rollback the changes:

```sql
-- Remove trigger
DROP TRIGGER IF EXISTS incidents_search_vector_trigger ON incidents;

-- Remove function
DROP FUNCTION IF EXISTS incidents_search_vector_update();

-- Remove index
DROP INDEX IF EXISTS incidents_search_idx;

-- Remove column
ALTER TABLE incidents DROP COLUMN IF EXISTS search_vector;
```

Then restart the application. The old search will work (but with limited functionality).

## Monitoring

### Check Search Performance

```sql
-- See most common search terms (add logging to track this)
-- Check index size
SELECT pg_size_pretty(pg_relation_size('incidents_search_idx')) as index_size;

-- Check table size
SELECT pg_size_pretty(pg_relation_size('incidents')) as table_size;
```

### Maintenance

The search index is automatically maintained. No regular maintenance needed.

For large databases (10,000+ incidents), consider running VACUUM ANALYZE monthly:

```sql
VACUUM ANALYZE incidents;
```

## Success Criteria

✅ All incidents have search_vector populated
✅ GIN index created successfully
✅ Trigger auto-updates search_vector
✅ Search works for all test cases
✅ Results are ranked by relevance
✅ Search is fast (< 100ms for most queries)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Supabase logs for errors
3. Check application console logs
4. Verify the migration ran completely

---

**Deployment Complete!** 🎉

Your incidents search now supports:
- Multi-field search (7 fields)
- Ranked results
- Fast performance with GIN indexing
- Automatic updates
- Natural language queries
