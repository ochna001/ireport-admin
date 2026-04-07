-- Add app_type column to push_tokens table
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_type TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_push_tokens_app_type ON push_tokens(app_type);

-- Mark Expo tokens as 'resident' (since resident app uses Expo)
UPDATE push_tokens 
SET app_type = 'resident' 
WHERE token LIKE 'ExponentPushToken%' 
  AND app_type IS NULL;

-- Mark native FCM tokens as 'responder' by default
UPDATE push_tokens 
SET app_type = 'responder' 
WHERE token NOT LIKE 'ExponentPushToken%' 
  AND app_type IS NULL;

-- Set default for future inserts
ALTER TABLE push_tokens 
ALTER COLUMN app_type SET DEFAULT 'responder';
