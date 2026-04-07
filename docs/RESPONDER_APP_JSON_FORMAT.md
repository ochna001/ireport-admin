# Responder App JSON Format Reference

This document describes the JSON format sent by the responder app (Kotlin Android) for final reports and drafts.

## BFP (Bureau of Fire Protection)

### Final Report Format
```json
{
  "timestamp": "yyyy-MM-dd HH:mm:ss",
  "fireLocation": "string",
  "areaOwnership": "string",
  "classOfFire": "string",
  "alarmType": "string",
  "number_of_victims": "string",
  "media_count": "string",
  "media_urls": "[\"url1\", \"url2\"]"
}
```

### Draft Format
```json
{
  "fireLocation": "string",
  "areaOwnership": "string",
  "classOfFire": "string",
  "alarmType": "string",
  "number_of_victims": "string",
  "evidence_count": "string",
  "media_urls": "[\"url1\", \"url2\"]"
}
```

### Admin App Mapping
- `alarmType` → `rootCause` (Admin app field)
- `number_of_victims` → `victimsCount` (Admin app field)
- `estimatedDamage` is NOT sent by responder app (admin-only field)

---

## PNP (Philippine National Police)

### Final Report Format
```json
{
  "narrative": "string",
  "timestamp": "yyyy-MM-dd HH:mm:ss",
  "evidence_count": "string",
  "suspects_count": "string",
  "victims_count": "string",
  "suspects": "Name1; Name2; Name3",
  "victims": "Name1; Name2; Name3"
}
```

### Admin App Mapping
- `suspects` (semicolon-separated string) → parsed into `PersonEntry[]`
- `victims` (semicolon-separated string) → parsed into `PersonEntry[]`
- `evidence_count` → `evidenceCount`
- `caseNumber` is NOT sent by responder app (admin-only field)

---

## PDRRMO Emergency (Medical Emergency)

### Final Report Format
```json
{
  "timestamp": "yyyy-MM-dd HH:mm",
  "natureOfCall": "string",
  "emergencyType": "string",
  "areaType": "string",
  "incidentLocation": "string",
  "narrative": "string",
  "facilityType": "string",
  "facilityName": "string",
  "time_call": "HH:mm",
  "time_dispatch": "HH:mm",
  "time_scene": "HH:mm",
  "time_depart": "HH:mm",
  "time_facility": "HH:mm",
  "time_handover": "HH:mm",
  "time_clear": "HH:mm",
  "time_base": "HH:mm",
  "patients_count": "string",
  "patients": "[{...}, {...}]",
  "media_count": "string",
  "media_urls": "[\"url1\", \"url2\"]"
}
```

### Patient Object Structure
Each patient in the `patients` array contains:
- Basic info: name, age, sex, address, nextOfKin
- Primary survey: chiefComplaint, cSpine, airway, breathing, pulse, skin, loc, consciousness, capRefill
- SAMPLE history: signs, allergies, medications, history, oral, events
- Vital signs (3 sets): bp, pulseRate, respRate, temp, spo2, capVital, pain, glucose, obsTime
- Body parts, injuries, treatments, disposition

### Admin App Mapping
- All fields use snake_case in responder app
- Admin app converts to camelCase
- `patients` JSON string is parsed into `PdrrmoPatientEntry[]`

---

## MDRRMO Disaster Report

### Final Report Format
```json
{
  "timestamp": "yyyy-MM-dd HH:mm",
  "report_type": "DISASTER",
  "disaster_type": "string",
  "affected_area": "string",
  "casualties_dead": 0,
  "casualties_injured": 0,
  "casualties_missing": 0,
  "families_affected": 0,
  "individuals_affected": 0,
  "damage_level": "string",
  "damage_details": "string",
  "narrative": "string",
  "media_count": "string",
  "media_urls": "[\"url1\", \"url2\"]"
}
```

### Admin App Mapping
- All fields use snake_case in responder app
- Admin app converts to camelCase
- `disasterTypeOther` is NOT sent by responder app (handled via `disaster_type` field)

---

## Common Fields

All reports include:
- `timestamp` - Report submission time
- `media_count` - Number of media files
- `media_urls` - JSON array string of media URLs

## Admin App Compatibility

The admin app's `populateFormFromDetails` function handles both:
- **snake_case** (from responder app)
- **camelCase** (from admin app)

Example:
```typescript
fireLocation: details.fireLocation || details.fire_location || ''
```

This ensures backward compatibility and proper parsing regardless of source.
