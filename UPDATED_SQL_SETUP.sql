-- ============================================================
-- STEP 1: Add app_type column to push_tokens table
-- ============================================================
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_type TEXT;

-- ============================================================
-- STEP 2: Create index for better query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_push_tokens_app_type ON push_tokens(app_type);

-- ============================================================
-- STEP 3: Update existing tokens based on token format
-- ============================================================

-- Mark Expo tokens as 'resident' (since resident app uses Expo)
UPDATE push_tokens 
SET app_type = 'resident' 
WHERE token LIKE 'ExponentPushToken%' 
  AND app_type IS NULL;

-- Mark native FCM tokens as 'responder' by default
-- (These are the long alphanumeric tokens without 'ExponentPushToken' prefix)
UPDATE push_tokens 
SET app_type = 'responder' 
WHERE token NOT LIKE 'ExponentPushToken%' 
  AND app_type IS NULL;

-- ============================================================
-- STEP 4: Set default for future inserts
-- ============================================================
-- Note: This default will be overridden by the mobile apps
-- which now explicitly set app_type in their code
ALTER TABLE push_tokens 
ALTER COLUMN app_type SET DEFAULT 'responder';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check the distribution of tokens by app_type
SELECT 
  app_type,
  COUNT(*) as token_count,
  COUNT(DISTINCT user_id) as unique_users
FROM push_tokens
GROUP BY app_type
ORDER BY app_type;

-- Check for any remaining NULL app_type values
SELECT COUNT(*) as null_app_type_count
FROM push_tokens
WHERE app_type IS NULL;

-- View sample tokens by type
SELECT 
  id,
  LEFT(token, 30) as token_preview,
  platform,
  app_type,
  created_at
FROM push_tokens
ORDER BY created_at DESC
LIMIT 10;
