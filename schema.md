## Table `agencies`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `varchar` |  Unique |
| `short_name` | `varchar` |  Unique |
| `created_at` | `timestamptz` |  Nullable |

## Table `agency_resources`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `station_id` | `int4` |  Nullable |
| `name` | `text` |  |
| `type` | `varchar` |  Nullable |
| `status` | `varchar` |  Nullable |
| `description` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `agency_stations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `agency_id` | `int4` |  |
| `name` | `text` |  |
| `latitude` | `numeric` |  |
| `longitude` | `numeric` |  |
| `contact_number` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `final_report_drafts`

Server-side drafts for final reports, editable by field officers, desk officers, chiefs, and admins

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `incident_id` | `uuid` |  Unique |
| `agency_type` | `text` |  |
| `author_id` | `uuid` |  Nullable |
| `draft_details` | `jsonb` |  |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `final_reports`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `incident_id` | `uuid` |  Unique |
| `report_details` | `jsonb` |  |
| `completed_by_user_id` | `uuid` |  |
| `completed_at` | `timestamptz` |  Nullable |

## Table `incident_agencies`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `incident_id` | `uuid` |  Nullable |
| `agency_id` | `int4` |  Nullable |
| `role` | `varchar` |  Nullable |
| `requested_at` | `timestamp` |  Nullable |
| `acknowledged_at` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `incident_status_history`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `incident_id` | `uuid` |  |
| `status` | `text` |  |
| `notes` | `text` |  Nullable |
| `changed_by` | `text` |  |
| `changed_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |

## Table `incident_updates`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `incident_id` | `uuid` |  |
| `author_id` | `uuid` |  Nullable |
| `update_text` | `text` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `incidents`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `agency_type` | `text` |  |
| `reporter_id` | `uuid` |  Nullable |
| `reporter_name` | `text` |  |
| `reporter_age` | `int4` |  |
| `description` | `text` |  |
| `latitude` | `numeric` |  |
| `longitude` | `numeric` |  |
| `location_address` | `text` |  Nullable |
| `media_urls` | `_text` |  Nullable |
| `status` | `text` |  |
| `assigned_officer_id` | `uuid` |  Nullable |
| `assigned_station_id` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `resolved_at` | `timestamptz` |  Nullable |
| `updated_by` | `text` |  Nullable |
| `first_response_at` | `timestamptz` |  Nullable |
| `assigned_officer_ids` | `_uuid` |  Nullable |
| `reporter_phone` | `text` |  Nullable |
| `reporter_latitude` | `numeric` |  Nullable |
| `reporter_longitude` | `numeric` |  Nullable |
| `assigned_resource_ids` | `_int4` |  Nullable |
| `casualties_category` | `text` |  Nullable |
| `casualties_count` | `int4` |  Nullable |
| `search_vector` | `tsvector` |  Nullable |
| `short_code` | `text` |  Nullable |

## Table `media`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `incident_id` | `int8` |  |
| `storage_path` | `text` |  |
| `media_type` | `varchar` |  |
| `uploaded_at` | `timestamptz` |  Nullable |

## Table `notifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `recipient_id` | `uuid` |  |
| `incident_id` | `uuid` |  Nullable |
| `title` | `text` |  |
| `body` | `text` |  |
| `is_read` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `display_name` | `text` |  Nullable |
| `email` | `text` |  Nullable Unique |
| `role` | `varchar` |  |
| `agency_id` | `int4` |  Nullable |
| `phone_number` | `varchar` |  Nullable |
| `age` | `int4` |  Nullable |
| `date_of_birth` | `date` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `station_id` | `int4` |  Nullable |
| `status` | `text` |  Nullable |

## Table `push_notification_log`

Logs all push notification attempts for debugging and cost monitoring

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `notification_id` | `int8` |  Nullable |
| `recipient_id` | `uuid` |  Nullable |
| `push_token` | `text` |  Nullable |
| `success` | `bool` |  Nullable |
| `error_message` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `push_tokens`

Stores Expo push tokens for user devices

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `token` | `text` |  Unique |
| `user_id` | `uuid` |  Nullable |
| `device_id` | `text` |  Nullable |
| `platform` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `app_type` | `text` |  Nullable |

## Table `security_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `user_id` | `uuid` |  Nullable |
| `action` | `text` |  |
| `details` | `jsonb` |  Nullable |
| `ip_address` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `unit_reports`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `incident_id` | `uuid` |  |
| `responder_id` | `uuid` |  |
| `agency` | `text` |  |
| `title` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `details` | `jsonb` |  |

