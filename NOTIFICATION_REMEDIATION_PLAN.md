# Notification Remediation Plan

## Goal

Deliver each notification once, recover missed deliveries, and make notification taps open the correct incident in the resident, responder, and admin apps.

## Current status

### Resident app

- Notification history is limited to an initial eight items with an explicit `See more updates` action.
- Notification cards include the report ID, status, timestamp, and unread state.
- Android channel naming is aligned to `ireport_notifications`.
- Notification taps mark the notification as read and deep-link to incident details.
- Status notification deduplication migration and trigger changes are in place.
- Stale push tokens are removed during token rotation.

### Responder app

- Notification taps open `ResponderDetailActivity` when an incident ID is present.
- Android-rendered background notifications have a fallback deep-link through `MainActivity`.
- Notification IDs are stable, based on `notification_id` or `incident_id`, instead of the current timestamp.
- The notification dialog initially shows eight items and provides a full-list action.
- The responder debug build passes.

### Admin app

- The current polling service checks only the last 30 seconds.
- Deduplication is in memory, so it resets after an app restart.
- Notifications can be missed while the app is closed.
- Push failures are marked as processed and are not retried.
- The polling service and database push triggers may send the same event.

## Implemented delivery architecture

The admin app is the canonical push sender. Each token delivery is claimed through the durable `notification_push_deliveries` table before a provider request is made:

1. Insert one notification row with a stable database ID.
2. The admin app claims one row per `(notification_id, token, app_type)` through a security-definer RPC.
3. Only the successful claimant sends the push.
4. The delivery is marked `sent` only after the provider accepts it.
5. Failed deliveries become retryable after a delay; stale processing locks can be reclaimed.
6. Invalid FCM tokens are removed during cleanup.
7. The unique delivery key prevents duplicate sends across admin restarts or simultaneous admin instances.

Do not add a second database-trigger sender. If a Supabase webhook or trigger already sends pushes in production, disable that sender or route it through the same delivery RPC before enabling this migration.

## FCM payload contract

Prefer data-only payloads so each app controls its own tap behavior:

```json
{
  "data": {
    "notification_id": "123",
    "incident_id": "INC-123",
    "app_type": "responder",
    "event_type": "assignment",
    "title": "New assignment",
    "body": "Incident INC-123 requires your response"
  }
}
```

Use `app_type` to prevent a resident token from receiving responder-only events and vice versa. Keep the database notification ID stable across retries.

## Duplicate-prevention rules

- Deduplicate at the database/outbox layer, not only in app memory.
- Use the notification database ID as the OS notification ID where possible.
- Treat realtime as an in-app refresh mechanism, not a second system-notification sender.
- Do not create a new notification row for every retry.
- Do not count total notifications as unread notifications; the badge must represent unread rows only.
- Mark a notification read after the user opens the linked incident, not merely when the push is received.

## Verification checklist

- Send one resident status update and confirm one resident push and one database row.
- Send one responder assignment and confirm one responder push and one database row.
- Repeat the same event and confirm the unique constraint prevents a duplicate.
- Kill each app, send a push, tap it, and confirm the correct incident opens.
- Rotate an FCM token and confirm the old token is not still active.
- Temporarily fail delivery and confirm retry behavior.
- Reconnect realtime and confirm it refreshes the badge without creating another system notification.
- Confirm `app_type` filtering for resident, responder, and admin recipients.

## Deployment order

1. Apply `supabase/migrations/20260721_notification_push_deliveries.sql`.
2. Deploy the updated `send-fcm` Edge Function.
3. Ship the updated admin app.
4. Confirm delivery rows are created and transition from `processing` to `sent`.
5. Confirm retry rows transition to `sent` after a temporary provider failure.

## Acceptance criteria

- No duplicate push for the same `(notification_id, recipient, app_type)`.
- No missed notification caused by a short polling window or app restart.
- Failed pushes are retryable and observable.
- Every actionable notification opens the associated incident.
- Badges show unread counts and remain consistent after opening or marking read.
