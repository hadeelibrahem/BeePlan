# BeePlan mobile feature-parity audit

Audit date: 2026-08-02

Scope: `apps/web` compared with `apps/mobile`. This is a source-level audit of routes, screens, feature modules, API clients, and tests. Existing worktree changes were treated as in-scope current implementation and were not reverted.

## Navigation audit

The mobile app has a typed React Navigation root stack and bottom-tab navigator in `apps/mobile/src/navigation`, plus a legacy `AppScreen` state machine still used by `App.tsx`. Core tabs are Dashboard, Tasks, Focus, Reminders, and People. Secondary destinations are reached through the More surface and typed stack routes. Task and reminder IDs are typed route params for the migrated detail/edit flows, and notification/deep-link handlers exist.

Remaining navigation risk: some legacy screen state and manually selected-object handlers remain in `App.tsx`; notification routing is not yet metadata-driven for every web notification category; Google Calendar OAuth/settings routes are not present in the mobile root stack.

## Feature-parity matrix

| Web screen/component | Existing mobile equivalent | Status | APIs/data/permissions | Required mobile work |
|---|---|---|---|---|
| Dashboard (`TasksDashboardScreen`) | `TasksDashboardScreen` | Partial | tasks API; authenticated user/task access | Finish parity for all dashboard cards, workload/conflicts, refresh/error/offline behavior, and typed navigation coverage. |
| Tasks (`AllTasksScreen`) | `AllTasksScreen` | Complete | task list/update/delete APIs; owner/member permissions | Keep virtualization and query-cache behavior under large lists; verify filters against web. |
| Task details (`TaskDetailsScreen`) | `TaskDetailsScreen`, `TaskDetailsRoute` | Partial | task, subtasks, dependencies, collaboration, reminders APIs; member role permissions | Add attachment lifecycle and verify every web automation/action is reachable natively. |
| Task creation | `CreateTaskScreen`, `CreateTaskRoute` | Partial | create-task DTO/validation; ownership and shared-task permissions | Complete all web fields and conflict handling; add attachment selection only when requested. |
| Task editing | `EditTaskScreen`, `EditTaskRoute` | Partial | update-task DTO/validation; owner/editor permissions | Complete web parity for attachments, schedule conflicts, travel/weather, and destructive confirmation. |
| Subtasks | task detail subtask UI and `createTaskSubtasks` helpers | Complete | task/subtask APIs; owner/editor permissions | Verify optimistic rollback and large subtask lists. |
| Dependencies | task detail dependency UI and `dependencyGraph` helpers | Complete | dependency APIs; owner/editor permissions | Verify cycle/error states and navigation to dependency tasks. |
| Shared tasks | shared badge, collaboration panel, task forms | Partial | members/invitations APIs; owner/editor/viewer permissions | Finish share actions and all permission-specific affordances in task create/edit/detail. |
| Collaboration overview | `CollaborationPanel`, collaboration APIs | Partial | member/comment/reminder/preferences APIs | Ensure all web collaboration actions are exposed, including mute and role flows. |
| Members and roles | `MembersSection`, `ManageMembersSection`, `InviteMemberSheet` | Partial | members/invite/role/remove/transfer APIs; owner/editor permissions | Complete invitation lifecycle, role restrictions, transfer ownership, and error/empty states. |
| Comments | `CommentsSection` with target `FlatList` scrolling | Complete | comments CRUD APIs; task-member permissions | Automatic comment-target scrolling, safe retry, and deleted-target feedback are implemented. |
| Mentions | comments composer/models | Partial | mentioned user IDs in comment API; task membership | Add mobile member picker/autocomplete and accessible mention results. |
| Attachments | `TaskAttachmentPicker`, task detail/edit attachment rows | Complete | attachment APIs; task owner/editor permissions; document/file permissions | Verify native supported-type preview/open behavior and upload progress on device. |
| AI Collaboration | `AiCollaborationScreen`, `AiCollaborationRoute`, mobile AI components | Partial | AI collaboration overview/plan/recommendation APIs; task collaboration permissions | Verify all web tabs/actions, apply/dismiss safety, and deep links. |
| AI Planner | `AiDailyPlannerScreen`, `AiTaskBuilderScreen` | Partial | planner and AI task-builder APIs; authenticated user | Verify full web planner preferences, recommendations, conflicts, and save flows. |
| Planning preferences | `plannerPreferences` helpers and planner UI | Partial | planner preference API/data; authenticated user | Surface every web preference in a mobile form and persist through backend. |
| Focus | `FocusScreen`, `FocusSessionScreen`, strict-focus feature | Complete | focus queue/session APIs; task ownership/member permissions | Verify history and notification integration; preserve session state across tabs. |
| Focus history | focus session data/history helpers | Partial | focus history/session APIs | Add a dedicated mobile history view if web history is user-facing; cover empty/error states. |
| Reminders | reminders feature screens/components | Complete | reminders CRUD/API; task/person/location permissions; location/notification permissions | Verify all types and native permission recovery paths. |
| Calendar | `CalendarScreen` | Partial | task/reminder/focus/calendar event data | Finish agenda/day details, workload indicators, conflicts, event details, and Google event display. |
| Google Calendar | `GoogleCalendarSettings`, `GoogleCalendarEvents` | Partial | Google OAuth, calendar discovery/sync/events APIs; account authorization | Native settings/events are now wired; verify production redirect allowlist and cold/warm OAuth return on device. |
| Daily planner | `AiDailyPlannerScreen` | Partial | planner API; authenticated user | Complete recommendation review, conflict resolution, and planner preference parity. |
| Notes | `NotesScreen` | Complete | notes API; authenticated user | Verify search, persistence, empty/error/offline states against web. |
| People/Friends | `PeopleScreen` | Partial | friends/requests/sharing APIs; social permissions | Finish final people design parity, detail sheet, pagination, and all request states. |
| Username search | People screen + `social.api` username endpoint | Complete | `/friends/search`; authenticated user; no email exposure | Add incremental loading and robust not-found/error handling. |
| Location sharing | People screen + proximity monitor | Partial | friend location permission/snapshot APIs; OS location permission | Verify foreground/background permission flows, revocation, and offline retry. |
| Notifications | `NotificationsScreen`, notification routing | Partial | notification list/read/unread APIs; authenticated user | Support every backend type from shared metadata, filters, category icons, deleted-target fallback, and badge reconciliation. |
| Mobile push settings | `MobileNotificationsSettings` | Partial | notification preferences, push-device registration APIs; OS notification permission | Complete system permission state, device registration state, open settings, re-register, retry-on-connectivity, and persistence tests. |
| Analytics | `AnalyticsScreen` | Complete | analytics API; authenticated user | Verify parity and scalable rendering. |
| Weather/travel assistance | `WeatherTravelSettings`, task weather/travel fields | Partial | weather/travel APIs; location permission; task edit permissions | Add/verify task-level mobile UX, saved-place selection, conflicts, and loading/error states. |
| Saved Places | `SavedPlacesSection`, `SavedPlaceEditor` | Complete | context saved-place CRUD APIs; authenticated user | Verify validation, map/native picker behavior, and offline write handling. |
| Weekly Commitments | `WeeklyCommitmentsSection`, `CommitmentEditor` | Complete | recurring commitment CRUD APIs; authenticated user | Verify conflict display and editing parity. |
| Profile | settings account area in web; mobile settings shell | Missing | profile update API; authenticated user | Add profile summary/edit form and avatar handling. |
| Account | web `AccountSettings` | Missing | profile/password/delete APIs; auth-provider restrictions | Add full-screen mobile account flow, password validation, delete confirmation, and provider-aware states. |
| Appearance | Settings appearance segmented control and `ThemeContext` | Complete | AsyncStorage and OS Appearance API | System, Light, and Dark preferences persist and apply immediately. |
| Language | `LanguageContext`, English/Arabic dictionaries, Settings selector | Partial | AsyncStorage, centralized translations, RTL restart | Arabic infrastructure exists and is persisted/RTL-aware, but some mobile surfaces still contain hardcoded English and require broader localization cleanup. |
| Privacy | web privacy/location/delete controls | Missing | privacy/account deletion APIs; location permissions | Add mobile privacy controls, permission status, delete/export availability, and confirmation. |
| Settings | mobile `SettingsScreen` | Partial | mixed context/weather/push/local settings APIs | Reorganize into functional parity sections: account, notifications, push, appearance, privacy, Google Calendar, weather/travel, places, commitments, sign out. |
| Authentication flows | `AuthScreen`, forgot/reset screens, Google auth service | Partial | auth APIs; secure token storage; OAuth deep links | Verify sign-in/sign-up/password reset/Google callback on native cold and warm starts; add navigation tests. |

## Priority implementation backlog

1. Core daily use: attachments are a task-detail blocker; then calendar agenda/Google events, notification metadata/deep links, push recovery, and planner gaps.
2. Collaboration: mentions, complete member/role/invitation controls, attachment permissions, and per-task notification mute.
3. Planning intelligence: task weather/travel, conflict surfaces, planner preferences, and recommendation completion.
4. Supporting features: account/profile, appearance, privacy, and remaining people/analytics parity.

## Audit conclusions

- The mobile codebase already reuses the backend through feature API clients rather than introducing a separate business layer.
- Several mobile API clients duplicate the small authenticated request wrapper; consolidating shared transport/types is useful but should not precede user-facing parity work.
- The current navigation target is mostly in place, but `App.tsx` still contains legacy state routing that should be removed incrementally after route coverage is verified.
- The original audit phase made no code changes; subsequent staged parity work is documented in the stage verification notes below.

## Stage verification notes

- Comment-target scrolling uses a real `FlatList` with `scrollToIndex` and measured-content retry handling.
- Appearance supports persisted System, Light, and Dark preferences.
- English and Arabic localization infrastructure is present and persisted with RTL restart handling; remaining hardcoded English labels mean language parity is still partial.
- Android device validation remains blocked when no emulator or physical device is connected.
- Android device validation status: blocked — `adb` is unavailable in this environment and no device/emulator is connected.
