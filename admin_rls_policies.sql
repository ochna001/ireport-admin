-- RLS Policies for Admin Dashboard
-- Run these in your Supabase SQL Editor to allow the admin app to read data

-- ============================================
-- INCIDENTS TABLE - Allow anon to read
-- ============================================

-- Allow anon users to read all incidents (for admin dashboard)
CREATE POLICY "Anon can view all incidents"
    ON public.incidents
    FOR SELECT
    TO anon
    USING (true);

-- ============================================
-- PROFILES TABLE - Allow anon to read
-- ============================================

-- Allow anon users to read all profiles (for admin user management)
CREATE POLICY "Anon can view all profiles"
    ON public.profiles
    FOR SELECT
    TO anon
    USING (true);

-- Allow anon users to update profiles (for admin user management)
-- Note: In production, you should use service_role key instead
CREATE POLICY "Anon can update profiles"
    ON public.profiles
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- ============================================
-- AGENCIES TABLE - Allow anon to read
-- ============================================

-- Allow anon users to read all agencies
CREATE POLICY "Anon can view all agencies"
    ON public.agencies
    FOR SELECT
    TO anon
    USING (true);

-- ============================================
-- IMPORTANT SECURITY NOTE
-- ============================================
-- These policies allow anonymous access for development/testing.
-- For production, you should:
-- 1. Use the service_role key in the admin app (backend only)
-- 2. Or implement proper admin authentication
-- 3. Remove these anon policies and use authenticated policies instead
