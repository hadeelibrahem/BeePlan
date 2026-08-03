# BeePlan mobile push notifications

BeePlan uses Expo Notifications and the Expo Push Service. The app must run as
an Expo development build or a production build; Expo Go is not sufficient for
remote push testing.

## Required configuration

- `EXPO_PUBLIC_API_URL`: a reachable HTTPS BeePlan API URL for physical devices
  (or a LAN URL during local development).
- `expo.extra.eas.projectId` in `apps/mobile/app.json` (already configured).
- Android FCM credentials and iOS APNs credentials configured for the EAS
  project before production delivery.

## Android test

1. Build/install an Expo development build on a physical Android device.
2. Confirm the phone can reach `EXPO_PUBLIC_API_URL`.
3. Sign in, open Settings, and enable Mobile notifications.
4. Trigger an eligible alert such as a task due reminder, mention, or deadline
   risk. Confirm the device receives it while BeePlan is backgrounded or closed.

## iOS test

Use a physical iPhone/iPad with valid APNs credentials. The iOS simulator is
not sufficient for remote push delivery. Follow the same registration and alert
steps as Android.

Push payloads carry the notification id and validated BeePlan entity route.
Tapping a task, focus, calendar, AI, or collaboration alert opens its relevant
screen; unknown or stale entities fall back to Notification Center.

Non-urgent pushes are delayed during the user's planner sleep window. High
priority reminders, mentions, conflicts, and deadline alerts bypass that delay.
