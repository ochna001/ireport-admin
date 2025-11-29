-- ============================================
-- PRODUCTION SECURITY SETUP FOR IREPORT ADMIN
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create admin_users table to track who can access the admin app
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin', 'viewer')),
  agency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS on admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Only admins can view admin_users
CREATE POLICY "Admins can view admin users" ON admin_users
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- 4. Policy: Only super_admins can modify admin_users
CREATE POLICY "Super admins can manage admin users" ON admin_users
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- ============================================
-- RLS POLICIES FOR INCIDENTS TABLE
-- ============================================

-- Allow admins to read all incidents
CREATE POLICY "Admins can read all incidents" ON incidents
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Allow admins to update incidents
CREATE POLICY "Admins can update incidents" ON incidents
  FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role IN ('admin', 'super_admin'))
  );

-- ============================================
-- RLS POLICIES FOR PROFILES TABLE
-- ============================================

-- Allow admins to read all profiles
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Allow admins to update profiles
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role IN ('admin', 'super_admin'))
  );

-- ============================================
-- FUNCTION TO CHECK IF USER IS ADMIN
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INSERT YOUR FIRST ADMIN USER
-- Replace with your actual email after creating an account
-- ============================================

-- First, create a user account in Supabase Auth (Dashboard > Authentication > Users > Add User)
-- Then run this with the user's ID:

-- INSERT INTO admin_users (user_id, email, role) VALUES (
--   'YOUR-USER-UUID-HERE',
--   'admin@example.com',
--   'super_admin'
-- );
