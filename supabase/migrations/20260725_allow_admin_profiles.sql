-- The desktop app has a PIN-based system administrator, and dispatch audit
-- records require that identity to have a profile backed by auth.users.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('Resident', 'Desk Officer', 'Field Officer', 'Chief', 'Admin'));
