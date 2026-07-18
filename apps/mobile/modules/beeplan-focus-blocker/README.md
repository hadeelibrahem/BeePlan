# BeePlanFocusBlocker

Android-only **Strict Focus Mode** for BeePlan — blocks self-selected distracting
apps until a focus session finishes. Productivity tool (Forest / Opal style), not
parental control. Implemented as a **local Expo Module** with native Kotlin +
Jetpack Compose and a typed React Native wrapper.

> Requires a **dev client / EAS build** — the native code does not run in Expo Go.

---

## 1. Architecture

Clean layering with a single stateful core (`BlockerController`). Every other
native piece is stateless and talks to the core, never to each other.

```
                         React Native (TypeScript)
  ┌───────────────────────────────────────────────────────────────┐
  │ index.ts (public API)  ·  useFocusBlocker                          │
  │ StrictFocusProvider (app root) · useStrictFocusSync · setup/stats UI │
  └───────────────▲───────────────────────────────┬──────────────────┘
        events    │                       methods  │
                  │        Expo Modules bridge      ▼
  ┌───────────────┴───────────────────────────────────────────────┐
  │           BeePlanFocusBlockerModule (thin marshalling)          │
  └───────────────▲───────────────────────────────┬──────────────────┘
     BlockerEventBus (SharedFlow)                  │
  ┌───────────────┴───────────────────────────────▼──────────────────┐
  │                       BlockerController (object)                  │
  │  state (StateFlow) · session persistence · block decision · stats │
  └──┬─────────────┬────────────┬────────────┬──────────────┬─────────┘
     │             │            │            │              │
  Session       Usage      Foreground   Focus          Block
  Store /       Access     AppDetector  NotificationMgr EventStore
  FocusSession  Manager    (UsageStats)  (ongoing +      (SharedPrefs)
  (device-      (AppOps)                 full-screen)
   protected)        │            ▲            │
                     │            │            │ raises
              FocusBlockerService (foreground, coroutine poll loop)
                     │                         ▼
              BootReceiver               BlockActivity (Compose, Material 3)
              (session recovery)         "Stay Focused" + countdown
```

**Why a single `object` core?** The service, the boot receiver, the block
activity and the JS module all need the same live session and the same block
decision. Centralising it removes cross-references, race conditions from
duplicated state, and makes recovery a single `initialize()` call.

**Time model.** Sessions store an absolute `endsAtMs` (wall clock), never a
ticking counter — so remaining time is correct after process death, navigation
or reboot, matching the JS `useFocusSession` contract.

---

## 2. Folder structure

```
modules/beeplan-focus-blocker/
├─ expo-module.config.json         # autolink descriptor (Android module class)
├─ index.ts                        # RN public API (no-ops off Android)
├─ src/
│  ├─ FocusBlocker.types.ts        # single source of truth for shared types
│  ├─ BeePlanFocusBlockerModule.ts # typed native proxy (requireNativeModule)
│  └─ hooks/useFocusBlocker.ts     # status mirror, countdown, permission recheck
└─ android/
   ├─ build.gradle                 # Compose + coroutines deps
   └─ src/main/
      ├─ AndroidManifest.xml       # perms + service + activity + receiver (merged)
      ├─ res/values/themes.xml     # full-screen theme for the block activity
      └─ java/com/beeplan/focusblocker/
         ├─ BeePlanFocusBlockerModule.kt   # Expo module surface
         ├─ core/          AppInfo · FocusStatus · BlockerController
         ├─ session/       FocusSession · SessionStore
         ├─ permission/    UsageAccessManager
         ├─ apps/          InstalledAppsProvider
         ├─ detection/     ForegroundAppDetector
         ├─ notification/  FocusNotificationManager
         ├─ service/       FocusBlockerService · BootReceiver
         ├─ stats/         BlockEvent · BlockEventStore
         ├─ events/        BlockerEvent · BlockerEventBus
         └─ ui/            BlockActivity · BlockScreen (Compose)

apps/mobile/src/features/focus/    # app-side integration (not part of module)
├─ StrictFocusContext.tsx          # app-root provider: blocker + prefs + sync + stats
├─ strictModeStorage.ts            # persisted user prefs (enabled + apps)
├─ useStrictFocusSync.ts           # arms/disarms native blocker from JS session
├─ StrictModeSection.tsx           # Strict Mode block inside the start modal
├─ StrictModeSetupSheet.tsx        # permission gate + app picker UI
└─ StrictStatsSheet.tsx            # post-session blocked-attempt summary

Wired into: App.tsx (mounts StrictFocusProvider), FocusScreen.tsx (setup +
start gating), FocusSessionScreen.tsx (active badge, stats, emergency exit).
```

---

## 3. Install / build

The module autolinks (Expo scans `modules/`). After adding it:

```bash
cd apps/mobile
npx expo prebuild --clean      # regenerate android/ with the merged manifest
npx expo run:android           # or build a dev client via EAS
```

No `app.json` change is required for linking. The permissions, service, activity
and boot receiver are declared in the module's own `AndroidManifest.xml` and are
merged into the app manifest at Gradle build time. Verified via
`npx expo-modules-autolinking resolve -p android`, which lists the module and its
class; the actual Kotlin compile requires the Android SDK + JDK 17.

### Permissions

| Permission | Type | Why |
| --- | --- | --- |
| `PACKAGE_USAGE_STATS` | special, manual | Foreground-app detection. No runtime prompt — the setup sheet routes the user to Settings. |
| `SYSTEM_ALERT_WINDOW` | special, manual | **Reliable** block-screen launch on Android 14+ (also grants background-activity-launch). Strongly recommended in the setup sheet. |
| `FOREGROUND_SERVICE` / `_SPECIAL_USE` | normal | Long-running monitoring. The `specialUse` subtype carries a justification you must describe in the Play Console. |
| `POST_NOTIFICATIONS` | runtime (13+) | Ongoing session notification. |
| `USE_FULL_SCREEN_INTENT` | normal | Best-effort fallback launch on older devices only. |
| `RECEIVE_BOOT_COMPLETED` | normal | Restore an in-flight session after reboot. |

`QUERY_ALL_PACKAGES` is deliberately **not** used — the app list comes from a
scoped `<queries>` launcher intent, which is sufficient and Play-policy-safe.

---

## 4. Public API

```ts
import {
  hasUsageAccess, openUsageAccessSettings, getInstalledApps,
  startStrictMode, stopStrictMode, getStatus, getStatistics,
  emergencyExit, allowAppTemporarily, subscribeToEvents,
  useFocusBlocker, isFocusBlockerSupported, isFocusBlockerAvailable,
} from 'modules/beeplan-focus-blocker';
```

| Method | Description |
| --- | --- |
| `hasUsageAccess(): boolean` | Sync check of Usage Access. |
| `openUsageAccessSettings()` | Deep-links to the Usage Access screen. |
| `getInstalledApps()` | Launchable apps with base64 icons. |
| `startStrictMode(config)` | Arms the service + blocking. |
| `stopStrictMode()` | Tears everything down (safe when idle). |
| `getStatus()` | Sync status snapshot. |
| `getStatistics(sessionId?)` | Aggregated block stats. |
| `emergencyExit(reason)` | Logs + ends the session. |
| `allowAppTemporarily(pkg, ms)` | 5-min "I really need this app" grant. |
| `subscribeToEvents(name, cb)` | `onStatusChange` / `onBlockAttempt` / `onSessionEnded` / `onEmergencyExit`. |

The end-to-end wiring lives in the real screens: `StrictFocusProvider` (mounted
at the app root in `App.tsx`) owns `useFocusBlocker` + prefs + `useStrictFocusSync`
and exposes them via `useStrictFocus()`, which `FocusScreen` and
`FocusSessionScreen` consume. `useStrictFocusSync` arms/disarms native blocking
purely from `useFocusSession`'s `active` session — never from component mount.

---

## 5. Testing strategy

**Unit (JVM, no device) — Robolectric / plain JUnit**
- `FocusSession` JSON round-trip, `remainingMs`/`isExpired` boundaries.
- `BlockerController.shouldBlock`: self-package ignored, non-listed ignored,
  temporary-allow honoured + expiry, single block-screen guard
  (`blockScreenActive`).
- `BlockEventStore`: append, `MAX_EVENTS` trimming, per-session filtering,
  statistics aggregation.
- `UsageAccessManager.hasAccess` via a fake `AppOpsManager`.

**Instrumented (device/emulator, API 24/29/33/35) — androidx.test + Espresso/Compose**
- `ForegroundAppDetector` returns the last-resumed package (needs granted Usage
  Access on the test device).
- `FocusBlockerService` reaches foreground and stops on expiry; no second poll
  loop on duplicate START.
- Full-screen intent raises `BlockActivity`; Compose assertions on countdown
  text, "Return to BeePlan", and the emergency-exit dialog.
- Reboot recovery: seed `SessionStore`, broadcast `BOOT_COMPLETED`, assert the
  service restarts only for a non-expired session.

**JS unit tests (implemented — `node --test`, no extra deps)**
- `strictSyncDecision.test.ts` — the full arm/disarm decision table (16 cases):
  disabled, no apps, missing permission, unavailable (iOS/Expo Go), permission
  granted after returning, arm-once, duplicate-start prevention, completion,
  cancellation, navigation-does-not-stop, restore-after-restart, stale/expired
  native session, mid-session disable, native-id mismatch re-arm, retry-after-fail.
- `strictStats.test.ts` — `summarizeEndReason` (completed vs emergency-exit vs
  stopped vs in-progress) and `latestTimestampFor` aggregation.

Run: `cd apps/mobile && node --test $(find src/features/focus -name '*.test.ts')`
→ **21 pass**. Full suite: **52 pass** (no existing tests broken).

The pure `decideStrictSync` extraction means the whole state machine is covered
without a React renderer; the thin hook around it delegates all logic to it.
Component-level coverage (RTL/Jest) is future work — not wired in this repo.

**Manual QA matrix**
- Permission denied → blocking is a no-op, UI shows the gate; strict start is
  refused until Usage Access is granted.
- Overlay granted + blocked app foreground → block screen within ~600 ms,
  countdown live, auto-closes at 0.
- Overlay NOT granted on Android 14+ → block screen may not surface; attempt is
  still logged (documented limitation, setup sheet warns).
- Kill BeePlan mid-session → notification persists, blocking continues.
- Emergency exit → reason logged, session ends; "Keep focusing" → session resumes.
- Battery optimisation on aggressive OEMs (Xiaomi/Samsung) → foreground service
  must survive; see Samsung setup below.

---

## 6. Known Android limitations

- **Not unbypassable.** A determined user can revoke Usage Access, force-stop the
  app, or disable the overlay permission mid-session. This is a productivity
  nudge, not a kiosk/MDM lock — the block screen re-appears on the next launch
  attempt while permissions hold, and revocation is surfaced in the session UI.
- **Android 14+ full-screen intents** are restricted to calling/alarm apps, so
  the block screen relies on `SYSTEM_ALERT_WINDOW`. Without it, blocking degrades
  to logging + a heads-up notification.
- **Foreground-service start limits (Android 12+):** the service is started while
  BeePlan is foregrounded (session start) or from `BOOT_COMPLETED`, both allowed
  contexts. It is never started from the background.
- **Detection cadence** is ~600 ms polling of `UsageStatsManager`; a very brief
  glance at a blocked app can occur before the wall appears. No accessibility
  service is used (by design).
- **OEM battery killers** (Samsung, Xiaomi, Oppo) may still kill the service
  under aggressive power saving; mitigated by START_STICKY + boot recovery, but
  the user should exclude BeePlan from optimisation.

## 7. Samsung (One UI) manual setup

Samsung is the most aggressive at killing background work. For reliable blocking:

1. **Usage Access** — Settings → Apps → BeePlan → *Usage access* (or the in-app
   prompt) → allow. Required.
2. **Display over other apps** — Settings → Apps → BeePlan → *Appear on top* →
   allow. This is what makes the block screen reliably show on One UI.
3. **Battery** — Settings → Battery → Background usage limits → ensure BeePlan is
   **not** in "Sleeping"/"Deep sleeping"; set BeePlan's battery to *Unrestricted*
   (Settings → Apps → BeePlan → Battery → Unrestricted).
4. **Notifications** — allow the BeePlan notification channel so the ongoing
   session notification and (fallback) block notification are permitted.
5. Optional: disable "Remove permissions if app unused" for BeePlan so Usage
   Access isn't auto-revoked.
