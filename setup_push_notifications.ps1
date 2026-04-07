# Complete Push Notification Setup Script
# Run this from C:\Projects\ireport-admin

Write-Host "`n=== Push Notification Multi-App Setup ===" -ForegroundColor Cyan
Write-Host "This script will configure Firebase secrets and deploy the edge function`n" -ForegroundColor White

# Step 1: Add app_type column via SQL
Write-Host "[1/4] SQL Setup" -ForegroundColor Yellow
Write-Host "Please run this SQL in Supabase SQL Editor:" -ForegroundColor White
Write-Host "https://supabase.com/dashboard/project/agghqjkyzpkxvlvurjpj/sql/new`n" -ForegroundColor Blue

$sql = @"
-- Add app_type column
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_type TEXT;
CREATE INDEX IF NOT EXISTS idx_push_tokens_app_type ON push_tokens(app_type);

-- Update existing tokens based on pattern
UPDATE push_tokens SET app_type = 'resident' WHERE token LIKE 'ExponentPushToken%' AND app_type IS NULL;
UPDATE push_tokens SET app_type = 'responder' WHERE token NOT LIKE 'ExponentPushToken%' AND app_type IS NULL;

-- Set default
ALTER TABLE push_tokens ALTER COLUMN app_type SET DEFAULT 'responder';
"@

Write-Host $sql -ForegroundColor Gray
Write-Host "`nPress Enter after running the SQL..." -ForegroundColor Yellow
Read-Host

# Step 2: Set Firebase Secrets
Write-Host "`n[2/4] Setting Firebase Secrets" -ForegroundColor Yellow

$residentJson = "C:\Users\Kenji\Downloads\ireport-5b578-firebase-adminsdk-fbsvc-29f00d8612.json"
$responderJson = "C:\Users\Kenji\Downloads\ireport-responder-firebase-adminsdk-fbsvc-e20f561be1.json"

if (-not (Test-Path $residentJson)) {
    Write-Host "ERROR: Resident Firebase JSON not found at: $residentJson" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $responderJson)) {
    Write-Host "ERROR: Responder Firebase JSON not found at: $responderJson" -ForegroundColor Red
    exit 1
}

Write-Host "Converting Resident app JSON to base64..." -ForegroundColor White
$residentContent = Get-Content $residentJson -Raw
$residentBytes = [System.Text.Encoding]::UTF8.GetBytes($residentContent)
$residentBase64 = [Convert]::ToBase64String($residentBytes)

Write-Host "Setting FCM_SERVICE_ACCOUNT_JSON_B64_RESIDENT secret..." -ForegroundColor White
npx supabase secrets set FCM_SERVICE_ACCOUNT_JSON_B64_RESIDENT=$residentBase64

Write-Host "`nConverting Responder app JSON to base64..." -ForegroundColor White
$responderContent = Get-Content $responderJson -Raw
$responderBytes = [System.Text.Encoding]::UTF8.GetBytes($responderContent)
$responderBase64 = [Convert]::ToBase64String($responderBytes)

Write-Host "Setting FCM_SERVICE_ACCOUNT_JSON_B64_RESPONDER secret..." -ForegroundColor White
npx supabase secrets set FCM_SERVICE_ACCOUNT_JSON_B64_RESPONDER=$responderBase64

# Step 3: Verify secrets
Write-Host "`n[3/4] Verifying Secrets" -ForegroundColor Yellow
npx supabase secrets list

# Step 4: Deploy edge function
Write-Host "`n[4/4] Deploying Edge Function" -ForegroundColor Yellow
npx supabase functions deploy send-fcm

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Rebuild both mobile apps (resident and responder)" -ForegroundColor Gray
Write-Host "2. Restart the Electron admin app (npm run dev)" -ForegroundColor Gray
Write-Host "`nPush notifications will now route correctly to both apps!" -ForegroundColor Cyan
