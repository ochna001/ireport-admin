-- =====================================================
-- One-shot heal for resources / officers stuck in busy/deployed
-- =====================================================
--
-- Why:
-- Before the responder Android app was patched, closing an incident from the
-- field only freed the *current user's* profile.status. Co-assigned officers
-- and any deployed resources stayed stuck busy/deployed indefinitely. The
-- admin assign card also previously trusted those cached columns, so the
-- checkboxes appeared disabled even when the resource was free in reality.
--
-- This script clears that historical drift. Safe to re-run; it only updates
-- rows that genuinely aren't held by any active incident anymore.
--
-- Run this ONCE in the Supabase SQL editor after deploying the patched admin
-- app + responder APK.
-- =====================================================

-- 1. Clear lingering assignment arrays on incidents that are already in a
--    terminal state. If an incident is closed but still claims officers /
--    resources, those claims are wrong by definition.
UPDATE public.incidents
   SET assigned_officer_id = NULL,
       assigned_officer_ids = '{}'::uuid[],
       assigned_resource_ids = '{}'::integer[]
 WHERE status IN ('resolved', 'closed', 'rejected', 'fake_report')
   AND (
     assigned_officer_id IS NOT NULL
     OR array_length(COALESCE(assigned_officer_ids, '{}'::uuid[]), 1) > 0
     OR array_length(COALESCE(assigned_resource_ids, '{}'::integer[]), 1) > 0
   );

-- 2. Free profiles whose `status = 'busy'` but who aren't actually claimed by
--    any active incident. Skips officers who really are still working.
UPDATE public.profiles p
   SET status = 'available'
 WHERE p.status = 'busy'
   AND NOT EXISTS (
     SELECT 1
     FROM public.incidents i
     WHERE i.status NOT IN ('resolved', 'closed', 'rejected', 'fake_report')
       AND (
         i.assigned_officer_id = p.id
         OR p.id = ANY(COALESCE(i.assigned_officer_ids, '{}'::uuid[]))
       )
   );

-- 3. Free agency_resources whose `status = 'deployed'` but which aren't
--    actually claimed by any active incident.
UPDATE public.agency_resources r
   SET status = 'available',
       updated_at = NOW()
 WHERE r.status = 'deployed'
   AND NOT EXISTS (
     SELECT 1
     FROM public.incidents i
     WHERE i.status NOT IN ('resolved', 'closed', 'rejected', 'fake_report')
       AND r.id = ANY(COALESCE(i.assigned_resource_ids, '{}'::integer[]))
   );

-- =====================================================
-- Verification queries (read-only — paste these separately if you want to
-- confirm nothing remains drifted).
-- =====================================================
-- SELECT r.id, r.name, r.status FROM public.agency_resources r
--  WHERE r.status = 'deployed'
--    AND NOT EXISTS (
--      SELECT 1 FROM public.incidents i
--       WHERE i.status NOT IN ('resolved','closed','rejected','fake_report')
--         AND r.id = ANY(COALESCE(i.assigned_resource_ids, '{}'::integer[]))
--    );

-- SELECT p.id, p.display_name, p.status FROM public.profiles p
--  WHERE p.status = 'busy'
--    AND NOT EXISTS (
--      SELECT 1 FROM public.incidents i
--       WHERE i.status NOT IN ('resolved','closed','rejected','fake_report')
--         AND (i.assigned_officer_id = p.id
--              OR p.id = ANY(COALESCE(i.assigned_officer_ids, '{}'::uuid[])))
--    );
