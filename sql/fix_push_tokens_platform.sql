-- Fix missing platform info in push_tokens table
-- This updates tokens without platform based on token format

-- Update Expo tokens (start with 'ExponentPushToken')
UPDATE push_tokens 
SET platform = 'ios',
    updated_at = NOW()
WHERE platform IS NULL 
AND token LIKE 'ExponentPushToken%';

-- Update FCM tokens (Android - don't start with 'ExponentPushToken')
UPDATE push_tokens 
SET platform = 'android',
    updated_at = NOW()
WHERE platform IS NULL 
AND token NOT LIKE 'ExponentPushToken%';

-- Show updated tokens
SELECT 
  id,
  LEFT(token, 30) || '...' as token_preview,
  user_id,
  platform,
  updated_at
FROM push_tokens
ORDER BY updated_at DESC;
