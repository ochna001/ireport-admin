# Push Token Registration Analysis

## Current Situation
- **push_tokens table**: Only 3 rows, only 2 have platform info
- **Problem**: Tokens not being registered consistently when users log in

## How Each App Registers Tokens

### 1. Resident App (ireport_v1) - Expo/React Native
**File**: `C:\Projects\ireport_v1\lib\notifications.ts`

**Registration Flow**:
```typescript
// Called on login with userId and deviceId
registerForPushNotifications(userId, deviceId)
  ↓
// Gets Expo push token
Notifications.getExpoPushTokenAsync({ projectId: '221989d9-3ee1-47f0-acd0-5896a298d8fb' })
  ↓
// Stores in Supabase
supabase.from('push_tokens').upsert({
  token,
  user_id: userId || null,
  device_id: deviceId || null,
  platform: Platform.OS,  // ✅ ALWAYS sets platform ('ios' or 'android')
  updated_at: new Date().toISOString()
}, { onConflict: 'token' })
```

**✅ Good**: Always sets `platform` field

---

### 2. Responder App (Ireport) - Kotlin/Android
**Files**: 
- `IReportFirebaseMessagingService.kt`
- `Repositories.kt`
- `responderSignIn.java`

**Registration Flow**:
```kotlin
// On login
FirebaseMessaging.getInstance().getToken()
  ↓
// Stores in Supabase
pushTokenRepository.storePushToken(token, userId, deviceId)
  ↓
// Repository implementation
client.from("push_tokens").upsert(
  PushTokenUpsert(
    token = token,
    userId = userId,
    deviceId = deviceId,
    platform = "android",  // ✅ Hardcoded to "android"
    updatedAt = Instant.now().toString()
  )
)
```

**✅ Good**: Always sets `platform = "android"`

**Also handles token refresh**:
```kotlin
// When FCM token changes
onNewToken(token: String) {
  app.pushTokenRepository.storePushToken(token, userId)
}
```

---

## Issues Identified

### Issue 1: Token Not Registered on Login
**Problem**: If `registerForPushNotifications()` or `storePushToken()` is not called during login, no token is saved.

**Possible Causes**:
- User denies notification permissions
- Login flow doesn't call token registration
- Token registration fails silently
- User not logged in when token is generated

### Issue 2: Missing Platform Info
**Problem**: 2 out of 3 tokens have no platform info

**Possible Causes**:
- Old tokens from before `platform` field was added
- Manual token insertion without platform
- Token registration code not setting platform (unlikely based on code review)

### Issue 3: Only 3 Tokens Total
**Problem**: Very few tokens registered

**Possible Causes**:
- Most users haven't logged in since token registration was implemented
- Token registration is failing silently
- Users are denying notification permissions
- Tokens are being deleted/overwritten incorrectly

---

## Recommendations

### 1. Add Better Logging
Add console logs to track:
- When token registration is attempted
- Whether permission is granted
- Whether upsert succeeds/fails
- The actual token and platform being saved

### 2. Make Registration More Robust

**For Resident App (ireport_v1)**:
```typescript
// Call on EVERY app start, not just login
useEffect(() => {
  if (user?.id) {
    registerForPushNotifications(user.id, deviceId);
  }
}, [user?.id]);
```

**For Responder App (Ireport)**:
```kotlin
// Call in MainActivity.onCreate() if user is logged in
override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  
  val userId = authRepository.getCurrentUserId()
  if (userId != null) {
    registerFcmToken()
  }
}
```

### 3. Add Fallback for Missing Platform
Update the push notification service to handle tokens without platform:

```typescript
// In pushNotificationService.ts
const platform = tokenData.platform || '';
const isExpo = tokenData.token.startsWith('ExponentPushToken');

// If no platform, try to detect from token format
if (!platform) {
  if (isExpo) {
    await this.sendExpoNotification(tokenData.token, notif);
  } else {
    // Assume FCM for Android
    await this.sendFCMNotification(tokenData.token, notif);
  }
}
```

### 4. Clean Up Old Tokens
Run SQL to update tokens without platform:

```sql
-- Update tokens that look like Expo tokens
UPDATE push_tokens 
SET platform = 'ios' 
WHERE platform IS NULL 
AND token LIKE 'ExponentPushToken%';

-- Update tokens that look like FCM tokens
UPDATE push_tokens 
SET platform = 'android' 
WHERE platform IS NULL 
AND token NOT LIKE 'ExponentPushToken%';
```

### 5. Add Admin UI for Token Management
Create a simple admin page to:
- View all registered tokens
- See which users have tokens
- Manually register/remove tokens
- Test sending push notifications

---

## Quick Fix for Current Issue

The immediate problem is that **notifications are created but no tokens exist for the assigned officers**.

**Solution**: Have officers log out and log back in to trigger token registration, OR implement the "register on app start" approach above.
