# Firebase Multi-App Push Notification Setup

This guide explains how to configure Supabase secrets for both the **Resident** and **Responder** apps to enable push notifications.

## Prerequisites

You need the Firebase service account JSON files:
- **Resident App**: `ireport-5b578-firebase-adminsdk-fbsvc-29f00d8612.json`
- **Responder App**: `ireport-responder-firebase-adminsdk-fbsvc-e20f561be1.json`

## Step 1: Install Supabase CLI

If you haven't already:
```bash
npm install -g supabase
```

## Step 2: Login to Supabase

```bash
supabase login
```

## Step 3: Link Your Project

```bash
supabase link --project-ref agghqjkyzpkxvlvurjpj
```

## Step 4: Set Secrets for Resident App

Navigate to where your JSON files are located:
```bash
cd "C:\Users\Kenji\Downloads"
```

Convert the Resident app JSON to base64 and set as secret:
```bash
# For Windows PowerShell:
$content = Get-Content "ireport-5b578-firebase-adminsdk-fbsvc-29f00d8612.json" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$base64 = [Convert]::ToBase64String($bytes)
supabase secrets set FCM_SERVICE_ACCOUNT_JSON_B64_RESIDENT=$base64

# For Windows Command Prompt (cmd):
certutil -encode "ireport-5b578-firebase-adminsdk-fbsvc-29f00d8612.json" temp.b64
# Then manually copy the base64 content (excluding header/footer) and run:
supabase secrets set FCM_SERVICE_ACCOUNT_JSON_B64_RESIDENT=<paste-base64-here>
```

## Step 5: Set Secrets for Responder App

```bash
# For Windows PowerShell:
$content = Get-Content "ireport-responder-firebase-adminsdk-fbsvc-e20f561be1.json" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$base64 = [Convert]::ToBase64String($bytes)
supabase secrets set FCM_SERVICE_ACCOUNT_JSON_B64_RESPONDER=$base64

# For Windows Command Prompt (cmd):
certutil -encode "ireport-responder-firebase-adminsdk-fbsvc-e20f561be1.json" temp.b64
# Then manually copy the base64 content (excluding header/footer) and run:
supabase secrets set FCM_SERVICE_ACCOUNT_JSON_B64_RESPONDER=<paste-base64-here>
```

## Step 6: Deploy the Updated Edge Function

```bash
cd C:\Projects\ireport-admin
supabase functions deploy send-fcm
```

## Step 7: Update Database Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Add app_type column to push_tokens table
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_type TEXT DEFAULT 'responder';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_push_tokens_app_type ON push_tokens(app_type);

-- Update existing tokens (if you know which are which)
-- For example, if all current tokens are from responder app:
UPDATE push_tokens SET app_type = 'responder' WHERE app_type IS NULL;
```

## Step 8: Verify Setup

Check that secrets are set:
```bash
supabase secrets list
```

You should see:
- `FCM_SERVICE_ACCOUNT_JSON_B64_RESIDENT`
- `FCM_SERVICE_ACCOUNT_JSON_B64_RESPONDER`

## How It Works

1. **Mobile Apps**: When users register for push notifications, they specify their `app_type` ('resident' or 'responder') in the `push_tokens` table.

2. **Admin App**: When sending notifications, the Electron app reads the `app_type` from the database and passes it to the edge function.

3. **Edge Function**: The function selects the correct Firebase service account based on `app_type` and sends the notification using the appropriate credentials.

4. **Result**: Resident app users receive notifications via the resident Firebase project, and responder app users receive notifications via the responder Firebase project.

## Troubleshooting

### 502 Errors
- Check Supabase → Edge Functions → send-fcm → Logs
- Verify secrets are set correctly: `supabase secrets list`
- Ensure both JSON files are valid and contain `project_id`

### No Notifications Received
- Check that `app_type` is set correctly in `push_tokens` table
- Verify Firebase Cloud Messaging is enabled in both Firebase projects
- Check Electron app console for push service logs

### Token Mismatch Errors
- Ensure the mobile app is using the correct `google-services.json` for its app type
- Verify the service account JSON matches the Firebase project the app is registered with
