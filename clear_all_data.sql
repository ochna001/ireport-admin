-- ============================================
-- iReport Database - Clear All Data Script
-- ============================================
-- WARNING: This script will DELETE ALL DATA from the database
-- Use this to get a fresh start and remove development/test data
-- The database structure (tables, columns, constraints) will remain intact
-- 
-- IMPORTANT: Run this in Supabase SQL Editor
-- Make sure you have a backup before running this!
-- ============================================

-- Disable triggers temporarily to avoid cascading issues
SET session_replication_role = 'replica';

-- ============================================
-- 1. Clear incident-related data (in dependency order)
-- ============================================

-- Clear final report drafts (depends on incidents)
DELETE FROM public.final_report_drafts;

-- Clear final reports (depends on incidents)
DELETE FROM public.final_reports;

-- Clear incident status history (depends on incidents)
DELETE FROM public.incident_status_history;

-- Clear incident updates (depends on incidents)
DELETE FROM public.incident_updates;

-- Clear unit reports (depends on incidents)
DELETE FROM public.unit_reports;

-- Clear incident media (depends on incidents)
DELETE FROM public.incident_media;

-- Clear notifications (depends on incidents and users)
DELETE FROM public.notifications;

-- Clear main incidents table
DELETE FROM public.incidents;

-- ============================================
-- 2. Clear user and profile data
-- ============================================

-- Clear security logs
DELETE FROM public.security_logs;

-- Clear profiles (this will cascade to related foreign keys)
-- Note: This will also affect auth.users if there are triggers
DELETE FROM public.profiles;

-- ============================================
-- 3. Clear Supabase Auth tables
-- ============================================
-- WARNING: This removes ALL authentication data including:
-- - All user accounts (admins, officers, etc.)
-- - All sessions
-- - All refresh tokens
-- - All identity providers
-- You will need to recreate all user accounts after this!

-- Clear auth sessions
DELETE FROM auth.sessions;

-- Clear auth refresh tokens
DELETE FROM auth.refresh_tokens;

-- Clear auth identities (social logins, etc.)
DELETE FROM auth.identities;

-- Clear auth users (main user accounts)
-- This is the main table - clearing this removes all accounts
DELETE FROM auth.users;

-- Optional: Clear other auth tables if they exist
-- DELETE FROM auth.audit_log_entries;
-- DELETE FROM auth.mfa_factors;
-- DELETE FROM auth.mfa_challenges;
-- DELETE FROM auth.mfa_amr_claims;
-- DELETE FROM auth.sso_providers;
-- DELETE FROM auth.sso_domains;
-- DELETE FROM auth.saml_providers;
-- DELETE FROM auth.saml_relay_states;
-- DELETE FROM auth.flow_state;

-- ============================================
-- 4. Clear agency resources and stations
-- ============================================

-- Clear agency resources (depends on stations)
DELETE FROM public.agency_resources;

-- Clear agency stations (depends on agencies)
DELETE FROM public.agency_stations;

-- Clear agencies
-- Note: You may want to keep agencies and re-insert them
-- Comment out the next line if you want to keep agency definitions
DELETE FROM public.agencies;

-- ============================================
-- 5. Clear settings and other data
-- ============================================

-- Clear any settings or configuration tables if they exist
-- DELETE FROM public.settings;

-- ============================================
-- 6. Reset sequences (optional)
-- ============================================
-- This resets auto-increment IDs back to 1
-- Uncomment if you want IDs to start from 1 again

-- ALTER SEQUENCE agencies_id_seq RESTART WITH 1;
-- ALTER SEQUENCE agency_stations_id_seq RESTART WITH 1;
-- ALTER SEQUENCE agency_resources_id_seq RESTART WITH 1;
-- ALTER SEQUENCE final_reports_id_seq RESTART WITH 1;
-- ALTER SEQUENCE incident_updates_id_seq RESTART WITH 1;

-- ============================================
-- Re-enable triggers
-- ============================================
SET session_replication_role = 'origin';

-- ============================================
-- Verification Queries
-- ============================================
-- Run these to verify all data has been cleared:

-- SELECT COUNT(*) as incidents_count FROM public.incidents;
-- SELECT COUNT(*) as profiles_count FROM public.profiles;
-- SELECT COUNT(*) as users_count FROM auth.users;
-- SELECT COUNT(*) as stations_count FROM public.agency_stations;
-- SELECT COUNT(*) as resources_count FROM public.agency_resources;
-- SELECT COUNT(*) as final_reports_count FROM public.final_reports;
-- SELECT COUNT(*) as drafts_count FROM public.final_report_drafts;

-- ============================================
-- Optional: Re-insert essential data
-- ============================================

-- Re-insert agencies if you deleted them
/*
INSERT INTO public.agencies (name, short_name) VALUES
  ('Philippine National Police', 'pnp'),
  ('Bureau of Fire Protection', 'bfp'),
  ('Provincial Disaster Risk Reduction and Management Office', 'pdrrmo'),
  ('Municipal Disaster Risk Reduction and Management Office', 'mdrrmo')
ON CONFLICT (short_name) DO NOTHING;
*/

-- ============================================
-- DONE!
-- ============================================
-- All data has been cleared from the database.
-- The structure remains intact and ready for production use.
