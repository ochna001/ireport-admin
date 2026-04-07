# PowerShell script to run SQL setup via Supabase API
$projectRef = "agghqjkyzpkxvlvurjpj"

Write-Host "Running SQL setup for push_tokens app_type..." -ForegroundColor Cyan

# Read the SQL file
$sql = Get-Content "UPDATED_SQL_SETUP.sql" -Raw

# You need to run this SQL manually in Supabase SQL Editor
Write-Host "`nPlease run the following SQL in your Supabase SQL Editor:" -ForegroundColor Yellow
Write-Host "https://supabase.com/dashboard/project/$projectRef/sql/new" -ForegroundColor Blue
Write-Host "`n$sql`n" -ForegroundColor White

Write-Host "Press any key after you've run the SQL..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "`nProceeding with Firebase secrets setup..." -ForegroundColor Cyan
