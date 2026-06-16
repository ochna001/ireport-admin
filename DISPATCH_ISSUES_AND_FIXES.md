# Dispatch Issues and Fixes

This document summarizes the dispatch issues found across `ireport_v1`, `ireport-admin`, and `Ireport`, with suggested fixes and recommended priority.

## Current Dispatch Architecture

The dispatch flow is split across three apps. `ireport_v1` creates resident incidents, uploads media, and auto-assigns the nearest station. `ireport-admin` is the main dispatch console for desk/chief/admin users, including station assignment, field-officer assignment, resource assignment, status updates, and multi-agency coordination. `Ireport` is the Android responder app that consumes assignments, shows active assigned incidents, lets responders mark arrival/update progress, receive notifications, submit field reports, and request backup.

## Issues and Suggested Fixes

| Area | Issue | Affected Project/File | Impact | Suggested Fix | Priority |
|---|---|---|---|---|---|
| Status schema | `schema.sql` allows only `pending`, `assigned`, `in_progress`, `resolved`, and `closed`, but Android code references `responding` and `completed`. | `ireport-admin/schema.sql`; `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt`; `Ireport/app/src/main/java/com/example/iresponderapp/ResponderDetailActivity.java` | If `responding` or `completed` is written to the database, it may fail against the current check constraint. If those statuses exist from old data, filtering may be inconsistent. | Standardize the status lifecycle. Recommended: use `assigned -> in_progress -> resolved -> closed`, remove `responding`/`completed` app-side references or explicitly add them to the DB constraint if they are required. | High |
| Active responder list | Android active incident query only includes `assigned` and `in_progress`, while other code also treats `responding` as active. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt` | Incidents set to `responding` would not appear in the responder active list. | If `responding` remains supported, include it in assigned incident filters. If not, remove `responding` references and map arrival to `in_progress` only. | High |
| Legacy Firebase assignment path | `activity_incident_details.java` still uses Firebase-style fields such as `Status`, `AssignedResponderUID`, and `AssignedResponderName`. | `Ireport/app/src/main/java/com/example/iresponderapp/activity_incident_details.java`; `Ireport/app/src/main/AndroidManifest.xml`; `Ireport/app/src/main/java/com/example/iresponderapp/OnProcessFragment.java` | This bypasses Supabase dispatch rules and conflicts with the current admin-only field-officer assignment process. It can create inconsistent assignment state if reachable. | Remove or disable this assignment path from responder navigation. Since field-officer assignment is admin-only, `OnProcessFragment` should not expose pending incidents for assignment. If the screen is retained, convert it to read-only or migrate it fully to Supabase without assignment controls. | High |
| Admin-only assignment boundary | Android repository still exposes `assignIncident(...)` and `assignIncidentAsync(...)`. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt` | Even if not currently used, it creates a future risk that field-officer assignment may be reintroduced outside the admin app. | Remove these methods from the public `IncidentsRepository` interface or mark them internal/unreachable. Keep assignment authority only in `ireport-admin`. | Medium |
| Multi-officer assignment consistency | Android `assignIncident(...)` only updates `assigned_officer_id`, not `assigned_officer_ids`. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt` | If accidentally used, it will not match admin multi-officer assignment logic. Other screens that check `assigned_officer_ids` may miss the assignment. | Prefer removing Android assignment methods because assignment is admin-only. If kept for emergency use, update both `assigned_officer_id` and `assigned_officer_ids` consistently. | Medium |
| Officer availability cleanup | Responder status updates only set the current responder profile to `busy`/`available`. Admin assignment can involve multiple officers through `assigned_officer_ids`. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt`; `ireport-admin/src/main/index.ts` | When an incident is resolved/closed from Android, other assigned officers may remain `busy`. | Centralize officer availability cleanup in admin/backend/database logic. On incident resolution/closure, release all officers in `assigned_officer_ids`, not just the current user. Consider a database function/RPC for status transitions. | High |
| Resource availability cleanup | Admin handles assigned resources, but responder-side status updates may close/resolve incidents without updating resource status. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt`; `ireport-admin/src/main/index.ts`; `ireport-admin/schema.md` | Resources assigned to an incident may remain `deployed` if the incident is completed from the responder app. | Move incident completion into a shared backend/RPC function that releases both officers and resources. Alternatively, ensure Android calls an admin-approved RPC rather than directly updating `incidents.status`. | High |
| Duplicated nearest-station logic | Nearest-station assignment exists in resident app/offline queue and admin fallback logic. | `ireport_v1/app/confirm-report.tsx`; `ireport_v1/lib/offlineQueue.ts`; `ireport-admin/src/main/index.ts` | Business rules may drift between apps. A future change to station selection could be applied in one app but not the other. | Centralize nearest-station assignment in one database RPC or edge function. Apps should call the same function after incident creation or status transition. | Medium |
| RPC definition visibility | Apps call `find_nearest_station`, but the RPC definition was not found in the inspected project files. | `ireport_v1/app/confirm-report.tsx`; `ireport_v1/lib/offlineQueue.ts`; database migrations | Harder to verify distance logic, agency filtering, and deployment reproducibility. New environments may miss the RPC. | Add the `find_nearest_station` function definition to versioned migrations or document where it is deployed. Include expected parameters and return fields. | High |
| Backup notification recipients | Backup request code says it notifies Chiefs and Desk Officers, but it loads all users in the same agency plus Admin users. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt` | Backup notifications may go to Field Officers or other roles unintentionally. | Filter agency recipients by intended roles, likely `Chief` and `Desk Officer`, then include `Admin` if desired. Update comment and behavior to match. | Medium |
| Realtime vs push notification responsibility | `NotificationsRealtimeManager` updates UI for Supabase realtime inserts, while OS notifications are expected to be handled by FCM. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/NotificationsRealtimeManager.kt`; `Ireport/app/src/main/java/com/example/iresponderapp/services/IReportFirebaseMessagingService.kt`; notification backend | If push tokens or FCM routing are incomplete, notifications may appear in-app only while foregrounded and not as background push alerts. | Verify push-token registration on app startup/login and confirm the notification backend sends to Android FCM tokens for assigned officers. Keep realtime for foreground UI sync only. | Medium |
| Misleading method name | `getAssignedIncidentsForToday()` does not filter by today; it loads all assigned incidents. | `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt`; `Ireport/app/src/main/java/com/example/iresponderapp/HomeFragment.java` | Dashboard code may be misunderstood, and future changes may assume date filtering exists. | Rename to `getAssignedIncidents()` or add an actual date filter if the dashboard should only show today’s incidents. | Low |
| Status history accuracy | Responder timeline uses created date as fallback for assigned/in-progress timeline rows instead of actual `incident_status_history`. | `Ireport/app/src/main/java/com/example/iresponderapp/ResponderDetailActivity.java`; `incident_status_history` table | Timeline may show inaccurate assignment/progress timestamps. | Load `incident_status_history` for the incident and render actual timestamps for assigned, in-progress, resolved, and closed events. | Low |
| `schema.md` drift risk | `schema.md` is useful for review, but the authoritative DB behavior depends on `schema.sql`, migrations, triggers, and deployed RPCs. | `ireport-admin/schema.md`; `ireport-admin/schema.sql`; Supabase migrations | Documentation may become outdated or incomplete compared with the live database. | Regenerate `schema.md` from the live database after schema changes. Keep migrations/RPCs/triggers versioned so docs and implementation stay aligned. | Medium |
| Multi-agency dispatch clarity | Admin supports multi-agency coordination through `incident_agencies`, but responder app mainly reads assigned incidents directly from `incidents`. | `ireport-admin/src/main/index.ts`; `ireport-admin/src/renderer/pages/IncidentDetail.tsx`; `Ireport/app/src/main/java/com/example/iresponderapp/supabase/Repositories.kt` | Field officers from supporting agencies depend on explicit officer assignment. Multi-agency acknowledgment alone may not make incidents visible to responders. | Keep this behavior if intentional. Document that multi-agency involvement is an admin/chief/desk workflow and responder visibility requires assignment through `assigned_officer_ids`. | Medium |

## Recommended Fix Order

### Immediate

1. Standardize valid incident statuses across database, admin app, resident app, and responder app.
2. Disable or remove the legacy Firebase assignment path from the responder app.
3. Ensure incident completion releases all assigned officers and resources.
4. Version the `find_nearest_station` RPC definition in migrations or dispatch database docs.

### Short Term

1. Centralize status transitions in a database RPC or backend service.
2. Centralize nearest-station assignment so resident, offline queue, and admin use the same logic.
3. Filter backup notifications to the intended roles.
4. Verify background push notification delivery for assigned officers.

### Cleanup / Refactor

1. Rename misleading responder repository methods.
2. Remove admin-only assignment methods from the Android responder repository interface.
3. Replace timeline fallback dates with real `incident_status_history` timestamps.
4. Regenerate `schema.md` whenever schema/migration changes are made.

## Notes and Assumptions

- Field-officer assignment is currently admin-only and should remain controlled by `ireport-admin`.
- `Ireport` should primarily consume assignments and update response progress, not assign pending incidents.
- `assigned_officer_ids` is the safer source for multi-officer assignment, while `assigned_officer_id` appears to be the primary/backward-compatible single-officer field.
- The database is the best place to centralize critical dispatch transitions because all apps touch the same incident records.
