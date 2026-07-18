# BeePlan Web ↔ Mobile Feature-Parity Audit

Date: 2026-07-18 · Branch: `hadeel` · Scope: `apps/web`, `apps/mobile` (with `apps/api` for endpoint truth)
Method: full static inventory of routes/screens/components/API clients on both platforms, endpoint diff against all NestJS controllers, behavior comparison per domain. No code was modified.

> Caveat: findings are from source inspection. The P0 navigation dead-ends were confirmed by tracing every render branch, but a runtime smoke test on a device is recommended before scheduling fixes.

---

# Executive Summary

| Metric | Count |
|---|---|
| Web feature areas audited | 21 domains / ~80 discrete features |
| FULL on mobile | ~38 (auth, reminders CRUD+AI+voice, focus core, AI collaboration hub, comments, members/roles/transfer, notifications core, friends/location-sharing, AI task builder, task edit basics, recurrence CRUD) |
| PARTIAL on mobile | 14 |
| MISSING on mobile | 9 (AI Daily Planner, Planner preferences, Calendar, Notes, Analytics, AI recurrence suggestions, AI recurrence text-parse, subtask CRUD UI, task-dependency management UI) |
| UNREACHABLE / broken-wired on mobile | 7 flows (blank-screen dead ends) + 1 dead component + 4 dead deep links |
| DIFFERENT | 6 |
| MOBILE-ONLY | 8 (strict focus w/ native blocking, local notifications, proximity monitor, Google browser-approval OAuth, pull-to-refresh, unread badge, sound player guard, dev diagnostics) |

**Top 3 takeaways**

1. **The mobile app is mid-migration (Task 20, "Stage 2") and the seams are broken.** The React Navigation tree renders **only** while the legacy state machine says `screen === 'dashboard'`; any legacy handler that navigates to `'tasks'`, `'focus'`, `'reminders'`, `'social'`, or `'taskDetails'` lands on a branch that renders `null` → **blank screen**. This affects exiting the Focus workspace, cancelling/saving the AI Task Builder, and the entire reminder detail/create back-navigation chain.
2. **Mobile task creation is a facade.** In `CreateTaskScreen` the priority/status/category/due-date/due-time/reminder controls have no handlers, and the "+ Add Subtask" / "+ Add Dependency" buttons are dead. Every task is created as `medium / todo / General / no due date`.
3. **Subtasks and dependencies cannot be managed on mobile at all** (no add/edit/delete/reorder UI anywhere), even though all the API client functions exist in `apps/mobile/src/lib/tasksApi.ts`. Four whole web screens (AI Planner, Calendar, Notes, Analytics) have no mobile counterpart.

**Verification runs**

> Navigation-spec update: `MAIN_TAB_SCREENS` now includes People and is mapped
> contractually to the five `MAIN_TAB_ROUTES` used by the shipped navigator.

> Post-audit navigation update: Calendar and AI Daily Planner are implemented and
> discoverable from Dashboard Quick Actions. They remain root-stack destinations
> (not additional tabs) and support `beeplan://calendar` and `beeplan://planner`.

- Web typecheck (`tsc -b`): ✅ clean.
- Mobile typecheck (`tsc --noEmit`): ✅ clean.
- Web tests (`vitest run`): 89/90 pass — 1 pre-existing failure in `apps/web/src/screens/AnalyticsScreen.test.tsx` ("renders stat cards from the same query data the Tasks list uses"), unrelated to this audit (no files changed).
- Mobile JS tests: **no test runner is installed/configured** (`apps/mobile/package.json` has no `test` script, no jest/vitest dependency) although `*.test.ts` files exist (`strictModeRules.test.ts`, `RootNavigator.test.ts`, `focusSoundPlayer.test.ts`, …). They are only type-checked today.

---

# Parity Matrix

Severity: P0 core broken · P1 major capability missing · P2 important gap · P3 polish.

| Area | Web feature | Web evidence | Mobile status | Mobile evidence | Missing behavior | Sev | Recommended task |
|---|---|---|---|---|---|---|---|
| Navigation | Every screen reachable + browser URLs | `apps/web/src/lib/appRoutes.ts` | **UNREACHABLE (broken)** | `apps/mobile/App.tsx:699-786` | Legacy `setScreen('tasks'/'focus'/'reminders'/'social'/'taskDetails')` renders `null` → blank screen (see Detailed Findings #1) | **P0** | Route legacy exits back into the navigator |
| Navigation | Deep links to tasks/reminders | `appRoutes.ts` regexes | PARTIAL | `src/navigation/linking.ts` vs `RootNavigator.tsx` | `ReminderDetails`, `CreateReminder`, `EditReminder`, `AiTaskBuilder` linking entries point at routes never registered in the stack | P2 | Register routes or prune linking config |
| Tasks · create | Priority/status/category/due date+time/reminder toggle+minutes | `apps/web/src/screens/CreateTaskScreen.tsx:255-383` | **PARTIAL (facade)** | `apps/mobile/src/screens/CreateTaskScreen.tsx:172-217` | Controls render but have no `onPress`; payload hardcodes `medium/todo/General`, no due date, reminder fixed 30 min | **P0** | Wire Create Task form controls (Edit Task already has the pickers to reuse) |
| Tasks · create | Add subtasks at creation | `CreateTaskScreen.tsx:204-230` + `SubtaskFormModal` | MISSING | `CreateTaskScreen.tsx:149-156` (dead button) | Cannot add subtasks | P0 | Part of Create Task rewire |
| Tasks · create | Add dependencies at creation | `CreateTaskScreen.tsx:317-345` + `TaskDependenciesWorkflowModal` | MISSING | `CreateTaskScreen.tsx:225-233` (dead button) | Cannot add dependencies | P1 | Wire `TaskDependenciesWorkflowSheet` (exists, never rendered) |
| Tasks · edit | Subtask CRUD (add/edit/delete/toggle) | `apps/web/src/screens/EditTaskScreen.tsx:219-268,483-520,770-800` | MISSING | `apps/mobile/src/screens/EditTaskScreen.tsx` (no subtask section) | No way to add/edit/delete a subtask anywhere on mobile | **P0** | Add subtask section to mobile Edit Task |
| Tasks · edit | Dependency add/replace/remove | `EditTaskScreen.tsx:271-300,696-712` | MISSING | none | View-only dependencies | P1 | Wire dependency sheet into Edit Task |
| Tasks · edit | Reminder enable + before-minutes | `EditTaskScreen.tsx:638-660` | PARTIAL | mobile `EditTaskScreen.tsx:565-572` (audience only) | Cannot toggle task reminder or change lead time | P2 | Add toggle + minutes picker |
| Tasks · edit | Everything else (title/desc/category/priority/status/dates/estimation/notes/attachments/recurrence/members/focus) | web ibid | FULL | mobile `EditTaskScreen.tsx:144-614` | — | — | — |
| Tasks · list | Inline complete/reopen with optimistic update + rollback + toast | `apps/web/src/screens/AllTasksScreen.tsx:177-232,631-648` | MISSING | `apps/mobile/src/screens/AllTasksScreen.tsx:326-376` (checkbox is a static `View`) | Must open details → status sheet to complete a task | P1 | Make list checkbox call `changeTaskStatus` optimistically |
| Tasks · list | Inline To Do ↔ In Progress select | `AllTasksScreen.tsx:234-279,690-702` | MISSING | none | — | P2 | Optional row action sheet |
| Tasks · list | Sort (due/priority/created/title, persisted) | `AllTasksScreen.tsx:93,125-130,316-320,402` | MISSING | none | No sorting at all | P1 | Add sort control + AsyncStorage persistence |
| Tasks · list | Filters (status tabs, due, focus, completed, high-priority, category) + chips + summary counts | `AllTasksScreen.tsx:134-175` | FULL | mobile `AllTasksScreen.tsx:97-127,293-308` (`TaskFiltersSheet`) | — | — | — |
| Tasks · list | Shared badge per row | `AllTasksScreen.tsx:169,589,658` | MISSING | none in list (dashboard has it) | Can't tell shared tasks apart in list | P2 | Reuse `sharedTaskIds` (already loaded in App.tsx:270-276) |
| Tasks · list | Recurrence suggestion cards | `AllTasksScreen.tsx:405-416`, `RecurrenceSuggestionCard.tsx` | MISSING | none | See AI section | P1 | — |
| Tasks · details | Header, badges, dates, progress, subtask visibility filter (mine/team/shared/unassigned/by-member), dependencies view, notes, attachments list, delete w/ confirm, viewer read-only gating | `apps/web/src/screens/TaskDetailsScreen.tsx` | FULL | `apps/mobile/src/screens/TaskDetailsScreen.tsx` | — | — | — |
| Tasks · details | Inline status control (quick simple-status change) + success feedback | `TaskDetailsScreen.tsx:327-340,408-419`, `InlineStatusControl.tsx` | PARTIAL | mobile has "Status" button → sheet only | One extra tap; no success confirmation text | P3 | Optional |
| Tasks · details | Time Tracking card (est/spent/remaining) | `TaskDetailsScreen.tsx:571-577` | MISSING | not rendered (data only in Edit) | Read-only members/viewers can't see time tracking | P2 | Add card |
| Tasks · details | Recurring details block (frequency/days/ends/next) | `TaskDetailsScreen.tsx:549-555,739-768` | PARTIAL | mobile `TaskDetailsScreen.tsx:425` (one summary row) | End condition/days not visible | P3 | Expand row |
| Tasks · details | Attachment preview modal (`/preview` endpoint) | `AttachmentPreviewModal.tsx`, `tasksApi.getAttachmentPreviewBlob` | DIFFERENT | mobile `tasksApi.openAttachment:500-517` (download → OS share sheet) | In-app preview absent; acceptable mobile idiom | P3 | none |
| Tasks · details | Edit subtask from details (full field editor) | `TaskDetailsScreen.tsx:658-675` + `SubtaskFormModal` (title/desc/priority/status/due/estimate/assignee/reminder) | **PARTIAL (dead end)** | `SubtaskDetailSheet.tsx` `onEdit` → navigates to Edit Task, which has no subtask editor | Editing subtask fields impossible | P0 | Part of subtask CRUD task |
| Subtasks | Subtask attachment upload/delete | `SubtaskDetailModal.tsx:96,110` | FULL | `SubtaskDetailSheet.tsx:95-136` | — | — | — |
| Subtasks | Subtask attachment download | `SubtaskDetailModal.tsx:270` | MISSING | no open action in sheet | Can add but never open subtask files | P2 | Reuse `openAttachment` pattern |
| Subtasks | Per-subtask dependencies (`PUT …/subtasks/:id/dependencies`) | `SubtaskFormModal` → `setSubtaskDependencies` | MISSING | client fn exists, no UI | — | P2 | Include in subtask editor |
| Subtasks | Reorder (`POST …/subtasks/reorder`) | web `reorderSubtasks` (used by form modal ordering) | MISSING | client fn exists, no UI | — | P3 | Later |
| Recurrence | Manual recurrence CRUD (modal/sheet, all frequencies, end conditions) | `TaskRecurrenceModal.tsx` | FULL | `TaskRecurrenceSheet.tsx` | — | — | — |
| Recurrence · AI | Natural-language recurrence parse (`POST /ai/recurrence/parse`) | `tasksApi.parseRecurrenceWithAi`, used in `TaskRecurrenceModal` (takes `accessToken`) | MISSING | sheet has no AI parse | Type "every 2nd Tuesday" etc. | P2 | Port AI parse row into sheet |
| Recurrence · AI | Recurrence suggestions feed + dismiss (`GET /ai/recurrence/suggestions`, `POST …/dismiss`) | `App.tsx:162-178,379-414`, cards on dashboard/tasks/details | MISSING | endpoints unused on mobile | Whole suggestion loop absent | P1 | New mobile surface |
| AI Task Builder | Chat → plan → edit → save (task+subtasks+reminders+focus flag), quick replies, understood summary | `apps/web/src/screens/AiTaskBuilderScreen.tsx` | FULL* | `apps/mobile/src/screens/AiTaskBuilderScreen.tsx` (even richer: `addSubtask` after create) | *Reachable, but Cancel/Save exits hit the P0 blank-screen bug | P0 (exit) | Fix exits |
| AI Daily Planner | Generate/accept daily plan, locked items, capacity, unscheduled reasons, complete-from-plan, preferences editor (energy, sleep/lunch, unavailable hours…) | `apps/web/src/screens/AiPlannerScreen.tsx` (1716 lines), `lib/plannerApi.ts` (5 endpoints) | MISSING | nothing | Entire domain | P1 | New mobile screen (phase-able) |
| Calendar | Month grid of tasks+reminders, day panel, create-task-for-date | `apps/web/src/screens/CalendarScreen.tsx` | MISSING | nothing | Entire domain | P1 | New mobile screen |
| Notes | Notes CRUD (`/notes`) | `apps/web/src/screens/NotesScreen.tsx`, `lib/notesApi.ts` | MISSING | nothing | Entire domain | P1 | New mobile screen |
| Analytics | Completion rate, trend, focus stats dashboard | `apps/web/src/screens/AnalyticsScreen.tsx`, `lib/analytics.ts` | MISSING | nothing | Entire domain | P2 | New mobile screen (client-side computation, cheap) |
| Focus | Stats tiles, AI recommendation, focus queue (start/remove/view), today's sessions, start-session modal (pomodoro/deep/quick/custom) | `apps/web/src/screens/FocusScreen.tsx` | FULL | `apps/mobile/src/screens/FocusScreen.tsx` | — | — | — |
| Focus session | Timer ring, pause/resume/cancel, break offer/timer, outcome dialog (done/partial), ambient sounds w/ volume & category | `apps/web/src/screens/FocusSessionScreen.tsx` | FULL | `apps/mobile/src/screens/FocusSessionScreen.tsx` | Exit hits P0 blank-screen bug | P0 (exit) | Fix exits |
| Strict Focus | — (not on web) | — | MOBILE-ONLY | `src/features/focus/*`, native module `modules/beeplan-focus-blocker` | App blocking, usage-access gate, strict stats sheet, early-end reasons | — | n/a |
| Reminders | List (search, type tabs, completed tab, toggle) | web `RemindersListScreen.tsx` | FULL | mobile `RemindersListScreen.tsx` | Web adds stats cards + skeleton (P3) | P3 | — |
| Reminders | Create/edit/details incl. AI text + voice draft, person/location/checklist/time types, map picker, place autocomplete | `features/reminders/**` (web) | FULL | `features/reminders/**` (mobile, plus local notif scheduling) | Back/cancel exits hit P0 bug | P0 (exit) | Fix exits |
| Reminders | "Create Person Reminder" CTA preselects Person type in form | `App.tsx:880-883` (`initialType`) | DIFFERENT | mobile list CTA → People screen (`RemindersListScreen.tsx:26`); mobile `CreateReminderScreen` has no `initialType` prop | Extra hop; person type only via manual type switch or AI | P3 | Pass initialType |
| Collaboration | Members list, invite (friends-only), accept/decline, role change, remove, transfer ownership, comments CRUD, preferences, shared/personal task reminders | `features/collaboration/**` (web) | FULL | identical API surface + `ManageMembersSection`, `InviteMemberSheet` | — | — | — |
| AI Collaboration | 7-tab hub (Overview/Today/Progress/Distribution/Suggestions/Timeline/History) + plan apply | `TaskCollaborationScreen.tsx`, `ai-collaboration*.api.ts` | FULL | `AiCollaborationScreen.tsx` (same tabs, same endpoints) | — | — | — |
| Notifications | List, unread count, mark read / read-all, pagination, invitations accept/decline w/ optimistic rollback | web `NotificationsScreen.tsx` | FULL | mobile `NotificationsScreen.tsx` (+pull-to-refresh, unread callback) | — | — | — |
| Notifications | Target-aware open (comment → AI Collaboration tab with `?notification=`) | `notificationRoutes.ts`, `App.tsx:663-676` | DIFFERENT | mobile always `onOpenTask(taskId)` → Task Details | Loses context for comment/suggestion notifications | P2 | Map `notificationTarget` to `AiCollaboration` route |
| Notifications | Search notifications | web `NotificationsScreen.tsx` (`search` filter) | MISSING | none | — | P3 | — |
| People/Social | Friends list+search, add by email, requests in/out (accept/decline/cancel), remove friend w/ confirm, location-sharing approve/reject/revoke w/ confirm, permissions overview | `features/social/screens/SocialScreen.tsx` | FULL | `features/social/screens/PeopleScreen.tsx` (+permission prompts, monitor start, dev diagnostics) | — | — | — |
| Auth | Email/password sign in/up, validation, forgot/verify-code/reset | web `AuthScreen/Forgot/Reset` | FULL | mobile same trio | — | — | — |
| Auth | Social login | web `SocialLogin` → `POST /auth/social-login` | DIFFERENT | mobile `signInWithGoogle` → browser `GET /auth/google` + approval polling | Same capability, different mechanism | — | none |
| Theme/i18n | Theme toggle, EN/AR toggle w/ RTL | web `TopActionBar` everywhere | FULL | mobile `AppHeader.tsx` | — | — | — |
| UI states | Delayed skeletons (`CoreListSkeleton`) tasks/focus/reminders | web `components/feedback/*` | MISSING | plain "Loading…" text | — | P3 | — |
| UI states | Toast success/error feedback | web `ToastProvider` | DIFFERENT | mobile uses `Alert.alert` / inline banners | Acceptable idiom | P3 | — |

---

# Detailed Findings

## 1. [P0] Legacy navigation dead-ends render a blank screen

- **Mobile files:** `apps/mobile/App.tsx` (lines 699–786), `src/navigation/backNavigation.ts`
- **Behavior:** the navigator subtree renders only when `user && screen === 'dashboard'` (`App.tsx:699`). The fallback legacy switch handles only `reset / auth / forgot / focusSession / aiPlanTask / create / details / edit / notifications` — every other value falls through to `null` (`App.tsx:781`), leaving an empty themed `View`.
- **Flows that hit it (exact call sites):**
  - `FocusSessionScreen onExit → setScreen('focus')` — `App.tsx:738`. Exiting the focus workspace = blank screen.
  - `AiTaskBuilderScreen onCancel → setScreen('tasks')` — `App.tsx:743`.
  - `AiTaskBuilderScreen onSaved → handleTaskCreated → setScreen('taskDetails')` — `App.tsx:384-387`. Saving an AI-built task = blank screen.
  - `CreateReminderScreen onCancel → setScreen('reminders')` — `App.tsx:750`.
  - `CreateReminderScreen onNavigatePeople → setScreen('social')` — `App.tsx:751`.
  - `ReminderDetailsScreen onBack → setScreen('reminders')` — `App.tsx:761` (details itself is reached from the Reminders tab via `setScreen('details')`, so create→details→back is a guaranteed dead end).
  - Latent: `handleMarkTaskDone → setScreen('tasks')` (`App.tsx:491`) — currently unused because mobile `TaskDetailsScreen` never destructures `onMarkDone`.
- **User impact:** core loops (finish focus session, save AI task, create reminder) end on an empty screen; recovery only via Android hardware back (history pops to dashboard) or app restart. iOS users have no recovery gesture.
- **Suggested approach:** in the legacy exit handlers, navigate back into the navigator instead of `setScreen`: either reset `screen` to `'dashboard'` and use a pending-navigation ref (`navigationRef.navigate('MainTabs', { screen: 'Tasks' })`), or finish Stage 2 by moving `focusSession`, `aiPlanTask`, and the reminder detail/create/edit flow into registered stack routes (types already exist in `src/navigation/types.ts`).
- **Risks:** interacts with `StrictFocusProvider` single-instance requirement (comment at `App.tsx:696-698`) and the focus-session restore effect.

## 2. [P0] Mobile Create Task form controls are not wired

- **Mobile file:** `apps/mobile/src/screens/CreateTaskScreen.tsx`
- **Web files:** `apps/web/src/screens/CreateTaskScreen.tsx`
- **Current mobile behavior:** `Segment`/`Chip`/`Select` for priority (172–178), status (180–186), category (188–189), due date/time (191–200), reminder toggle/time (203–216) render without handlers; save payload hardcodes `priority:'medium', status:'todo', category:'General', reminderEnabled:true, reminderBeforeMinutes:30` and omits `dueDate/dueTime` (75–85). "+ Add Subtask" (149–156) and "+ Add Dependency" (225–233) have no `onPress`.
- **Web behavior:** all fields editable, subtasks and dependencies attachable pre-save, unsaved-changes guard covers all fields.
- **User impact:** every mobile-created task needs an immediate round-trip through Edit Task to set a due date/priority/category; subtasks/dependencies can never be added (Edit Task lacks those sections too — finding 3).
- **Approach:** lift the working pickers from `EditTaskScreen.tsx` (`openDatePicker`/`openTimePicker`, `Segment`/`Chip` with `onPress`, category chips) into Create; include chosen values in the payload; extend the dirty-check in `hasUnsavedChanges`.
- **Acceptance:** created task reflects all chosen fields via `POST /tasks`; guard fires when any field is dirty.

## 3. [P0] No subtask CRUD anywhere on mobile

- **Mobile files:** `apps/mobile/src/screens/EditTaskScreen.tsx` (no subtask section), `src/components/SubtaskDetailSheet.tsx` (`onEdit` → Edit Task → dead end), `src/lib/tasksApi.ts` (`addSubtask`/`updateSubtask`/`deleteSubtask`/`reorderSubtasks`/`setSubtaskDependencies` all exist, only `addSubtask` used — by the AI builder).
- **Web files:** `apps/web/src/screens/EditTaskScreen.tsx:219-268`, `components/SubtaskFormModal.tsx` (title, description, priority, status, due date/time, estimated duration, assignee, reminder), `components/DeleteSubtaskModal.tsx`, `components/SubtaskDetailModal.tsx`.
- **Endpoints:** `POST/PATCH/DELETE /tasks/:id/subtasks[...]`, `POST /tasks/:id/subtasks/reorder`, `PUT /tasks/:id/subtasks/:sid/dependencies`.
- **Mobile today:** subtasks can only be toggled done / status-changed / given attachments (via `SubtaskDetailSheet`). Cannot create, retitle, re-assign, re-schedule, estimate, or delete one.
- **Impact:** breaks the "subtasks as full task units" redesign (Phase 1 shipped on web) and collaboration assignment flows on mobile.
- **Approach:** build a `SubtaskFormSheet` mirroring web's `SubtaskFormModal`, mount it from Edit Task ("Editable Subtasks" card with add/edit/delete) and from `SubtaskDetailSheet.onEdit`.

## 4. [P1] No task-dependency management on mobile

- **Mobile:** `src/components/TaskDependenciesWorkflowSheet.tsx` opens with the literal comment *"currently never rendered"*; Task Details shows dependencies read-only; Edit Task has no section; Create's button is dead.
- **Web:** `TaskDependenciesWorkflowModal` (add/edit-replace/remove) wired in Create (`CreateTaskScreen.tsx:424-439`) and Edit (`EditTaskScreen.tsx:271-300,696-712`), calling `POST/PATCH/DELETE /tasks/:id/dependencies…`.
- **Impact:** the dependency-blocking rules (can't start/complete blocked tasks — enforced on both platforms' status flows) can never be configured from mobile.
- **Approach:** render the existing sheet from Edit Task; it already models `add|edit|remove` modes.

## 5. [P1] Four web domains have no mobile surface

| Domain | Web evidence | Endpoints only web uses |
|---|---|---|
| AI Daily Planner | `screens/AiPlannerScreen.tsx`, `lib/plannerApi.ts` | `POST /ai/planner/daily`, `POST/GET /ai/planner/daily/accept`, `GET/PUT /ai/planner/preferences` |
| Calendar | `screens/CalendarScreen.tsx` | none (reuses tasks+reminders) |
| Notes | `screens/NotesScreen.tsx`, `lib/notesApi.ts` | `POST/GET/PATCH/DELETE /notes` |
| Analytics | `screens/AnalyticsScreen.tsx`, `lib/analytics.ts` | none (client-side over tasks/reminders/focus-stats) |

Impact: the "Today plan" concept, schedule view, notes, and progress analytics are desktop-only. Calendar/Analytics are cheap ports (pure client composition); Planner is the largest single build (preferences editor + plan renderer + accept flow); Notes is a small CRUD screen.

## 6. [P1] AI recurrence suggestions loop missing on mobile

- **Web:** `App.tsx:162-178` fetches `GET /ai/recurrence/suggestions` after task loads; `RecurrenceSuggestionCard` on Dashboard/All Tasks/Task Details; accept → `TaskRecurrenceModal` prefilled → `PUT /tasks/:id/recurrence` + `POST /ai/recurrence/suggestions/:id/dismiss`; dismiss → dismiss endpoint. Web modal also offers AI text parse (`POST /ai/recurrence/parse`).
- **Mobile:** endpoints never called; `tasksApi` lacks `getRecurrenceSuggestions`/`dismissRecurrenceSuggestion`/`parseRecurrenceWithAi`; `TaskRecurrenceSheet` has no AI parse input.
- **Approach:** port the three client functions, add suggestion cards to the mobile dashboard, prefill `TaskRecurrenceSheet` from a suggestion (web's `recurrenceSuggestionToSettings` in `App.tsx:913-968` is reusable as-is).

## 7. [P1] No inline complete/reopen or sorting in mobile All Tasks

- **Web:** `AllTasksScreen.tsx:177-232` optimistic toggle with rollback + toast + dependency-block guard; `:234-279` inline simple-status select; `:316-320` sort persisted to `localStorage`.
- **Mobile:** `AllTasksScreen.tsx:339-343` checkbox is a decorative `View`; whole card opens details; no sort UI.
- **Approach:** wrap the checkbox in a `Pressable` calling `changeTaskStatus` with the same optimistic/rollback pattern (block when `task.isBlocked`), and add a sort selector persisted via AsyncStorage.

## 8. [P2] Notification opens lose their target on mobile

- **Web:** `features/collaboration/notificationRoutes.ts` maps notification types to `/tasks/:id` vs `/tasks/:id/collaboration?notification=…`; `App.tsx:663-676` navigates accordingly.
- **Mobile:** `App.tsx:687-694` and `NotificationsScreen` always call `onOpenTask(taskId)` → Task Details.
- **Approach:** port `notificationTarget` (it's pure) and branch to `navigate('AiCollaboration', { taskId })` for comment/suggestion types.

## 9. [P2] Task reminder toggle/lead-time not editable on mobile

- **Web:** `EditTaskScreen.tsx:638-660` checkbox + minutes select saved in `PATCH /tasks/:id`.
- **Mobile:** `EditTaskScreen.tsx` save payload omits `reminderEnabled`/`reminderBeforeMinutes`; only the collaboration audience section is shown. Combined with Create hardcoding 30-min-enabled, users can never turn a task reminder off or change lead time on mobile.

## 10. [P2] Task Details omissions on mobile

- Time Tracking card (`TaskDetailsScreen.tsx:571-577` web) — MISSING; viewers/editors can't see est/spent/remaining without edit rights.
- Recurring detail block (`:549-555`) — reduced to one `AutomationRow` (`mobile TaskDetailsScreen.tsx:425`).
- Subtask attachment download — web `SubtaskDetailModal.tsx:270`; mobile sheet can add/delete but not open files.
- Recurrence suggestion cards — see finding 6.

## 11. [P2] Broken/declared-but-unregistered deep links on mobile

`src/navigation/linking.ts` declares `ReminderDetails: 'reminders/:reminderId'`, `CreateReminder: 'reminders/new'`, `EditReminder: 'reminders/:reminderId/edit'`, and types declare `AiTaskBuilder`, but `RootNavigator.tsx` registers none of them; opening those URLs cannot resolve. Task links (`tasks/:taskId`) resolve only while the navigator is mounted (`screen === 'dashboard'`).

## 12. [P3] Differences worth knowing (acceptable or minor)

- Person-reminder CTA: web preselects Person type in the create form (`App.tsx:880-883`); mobile routes to People screen (`RemindersListScreen.tsx:26`) — and the create screen lacks the `initialType` prop web has.
- Dashboard quick actions: web has Calendar; mobile substitutes Notifications; mobile "New Reminder" opens the list, web opens the create form.
- Web `changeSimpleStatus` posts inline success text per row; mobile has no equivalent.
- Skeletons (`CoreListSkeleton` + `useDelayedSkeleton`) exist only on web.
- Mobile All Tasks stat tiles compute from the App-level `tasks` prop (loaded once at sign-in and on mutations) rather than the shared query cache — counts can lag pull-to-refresh of the filtered list.
- Attachment preview: web in-app modal (`/preview` endpoint); mobile downloads and opens the OS share sheet (`/download` endpoint). Functionally equivalent.

---

# Web-only API Usage

| Endpoint | Web caller | User-facing capability |
|---|---|---|
| `POST /auth/social-login` | `lib/api.ts:151` | One-tap Google credential login (mobile uses the `GET /auth/google` browser-approval flow instead — capability parity, mechanism differs) |
| `POST /notes`, `GET /notes`, `PATCH /notes/:id`, `DELETE /notes/:id` | `lib/notesApi.ts` | Notes feature |
| `POST /ai/planner/daily` | `lib/plannerApi.ts:81` | Generate AI daily plan |
| `POST /ai/planner/daily/accept`, `GET /ai/planner/daily/accept` | `plannerApi.ts:106,125` | Accept / restore today's plan |
| `GET/PUT /ai/planner/preferences` | `plannerApi.ts:162,176` | Planning preferences (working hours, energy, sleep/lunch, buffers) |
| `POST /ai/recurrence/parse` | `tasksApi.parseRecurrenceWithAi` | Natural-language recurrence entry |
| `GET /ai/recurrence/suggestions`, `POST /ai/recurrence/suggestions/:id/dismiss` | `tasksApi.ts:872,878` | AI "make this recurring" suggestions |
| `GET /tasks/:id/attachments/:attachmentId/preview` | `tasksApi.getAttachmentPreviewBlob` | In-app attachment preview |
| `GET /tasks/:id/subtasks/:sid/attachments/:aid/download` | `tasksApi.downloadSubtaskAttachment` | Download subtask attachments |

**Mobile-only endpoints:** `POST /person-reminders/location-snapshot`, `GET /person-reminders/nearby` (proximity monitor), `GET /auth/google*` (OAuth approval flow).

**Endpoints no client calls** (context): `POST /auth/signup` (alias of register), `GET /auth/exists`, `POST /tasks/recurrence/run` (ops/cron trigger), `PATCH /tasks/:id/progress`, `POST /speech/transcribe` (voice drafts upload audio to `/ai/voice-reminder-draft` instead), `GET /notes/:id`, `POST /location-sharing/requests` (superseded — `person-reminders.service.ts:241` upserts the request server-side when a person reminder is created; web's `requestLocationSharing` in `social.api.ts:72` is dead code), `GET /tasks/:id/subtasks/:sid/attachments/:aid/preview`.

---

# Unreachable Mobile Implementations

1. **`src/components/TaskDependenciesWorkflowSheet.tsx`** — complete add/edit/remove dependency sheet, self-documented as "currently never rendered". Only its `DependencyTask` type is imported.
2. **Blank-screen states** — the seven flows in Detailed Finding #1: implementations exist and work, but their exit navigation strands the user.
3. **Dead deep-link config** — `linking.ts` entries `ReminderDetails`, `CreateReminder`, `EditReminder` (and typed `AiTaskBuilder` route) with no registered screen.
4. **Unwired client functions** — `tasksApi.deleteSubtask`, `reorderSubtasks`, `setSubtaskDependencies`, `removeTaskLabel`/`addTaskLabel`/`getTaskLabels` (labels have no UI on either platform, but web at least shares that gap), `updateTaskTimeEstimation` (both platforms send estimation through `PATCH /tasks/:id` instead).
5. **`navigationStructure.ts` drift** — `MAIN_TAB_SCREENS` lists 4 tabs while the shipped navigator (`types.ts MAIN_TAB_ROUTES`) has 5 (People); the spec file no longer matches the implementation.

# Legacy and Duplicate Flows

- **Dual navigation systems** (`App.tsx`): React Navigation tab/stack tree (Dashboard/Tasks/Focus/Reminders/People tabs + TaskDetails/CreateTask/EditTask/AiCollaboration/Notifications stack) *and* the legacy `screen` state machine (focusSession, aiPlanTask, reminder create/details/edit, notifications, auth trio). The legacy `notifications` branch (`App.tsx:775-781`) duplicates the registered `Notifications` stack route — two code paths for the same screen.
- **Dual hardware-back handlers**: the older inline `BackHandler` effect (`App.tsx:139-168`, with its own discard-changes alerts for `aiPlanTask/create/edit`) coexists with the newer `useHardwareBack` + `resolveHardwareBack` (`App.tsx:522-534`) and per-form `useUnsavedBackGuard`s — three layers answering the same button.
- **Duplicated task-delete logic**: `handleDeleteTask` (`App.tsx:448-478`) and the inline deletion closure in `TaskDetailsStackRoute` (`App.tsx:656-671`) implement the same guarded delete twice.
- **`ScreenHistory` + `SCREEN_PARENTS`**: two back-stack models retained for the legacy machine.

---

# Prioritized Backlog

## Phase 1 — P0/P1 core parity

1. **Fix legacy navigation dead ends** — Scope: route every legacy exit (`focusSession→focus`, `aiPlanTask→tasks/taskDetails`, reminder `create/details/edit→reminders`, `→social`) back into the navigator. Files: `apps/mobile/App.tsx`, `src/navigation/*`. Acceptance: no `setScreen` target renders `null`; exiting focus workspace, cancelling/saving AI builder, and reminder back-chain land on visible screens. Tests: extend `RootNavigator.test.ts`/`backNavigation.test.ts` with a "every AppScreen renders content" contract test.
2. **Wire Create Task form** — Scope: priority/status/category/due date/time/reminder controls + payload; reuse Edit Task pickers. Files: `src/screens/CreateTaskScreen.tsx`. Acceptance: created task persists all fields; dirty-guard covers them. Tests: payload-mapping unit test.
3. **Mobile subtask CRUD** — Scope: `SubtaskFormSheet` (fields per web `SubtaskFormModal`), Edit Task "Subtasks" card (add/edit/delete), `SubtaskDetailSheet.onEdit` opens it. Files: new `src/components/SubtaskFormSheet.tsx`, `src/screens/EditTaskScreen.tsx`, `src/components/SubtaskDetailSheet.tsx`. Acceptance: add/edit/delete round-trips `POST/PATCH/DELETE /tasks/:id/subtasks`; assignee restricted to members. Tests: unit test for payload building; reuse `lib/subtasks.ts` tests.
4. **Dependency management UI** — Scope: mount `TaskDependenciesWorkflowSheet` in Edit Task (add/replace/remove) and Create Task (pre-save list). Acceptance: `POST/PATCH/DELETE /tasks/:id/dependencies` reachable; blocked-task rules observable.
5. **Inline complete/reopen in All Tasks + sort** — Scope: pressable checkbox with optimistic rollback + `isBlocked` guard; sort field/direction persisted. Files: `src/screens/AllTasksScreen.tsx`. Tests: sorting comparator unit test.
6. **AI recurrence suggestions on mobile** — Scope: port `getRecurrenceSuggestions`/`dismiss`/`parseRecurrenceWithAi` into `src/lib/tasksApi.ts`; suggestion cards on Dashboard; prefill `TaskRecurrenceSheet`. Tests: suggestion→settings mapping (port web `recurrenceSuggestionToSettings`).

## Phase 2 — P2 functional parity

7. **Notification target routing** — port `notificationTarget`; comment/suggestion notifications open `AiCollaboration`. Tests: port `notificationRoutes.test.ts`.
8. **Task reminder toggle + lead time in Edit Task** (include fields in `PATCH /tasks/:id` payload).
9. **Time Tracking card + full Recurring block in Task Details.**
10. **Subtask attachment open/download** in `SubtaskDetailSheet` (reuse `openAttachment` pattern with the subtask download URL).
11. **Register or prune reminder deep links**; if registering, move reminder screens into the stack (aligns with task 1).
12. **Shared badge in All Tasks rows** (thread existing `sharedTaskIds`).
13. **Analytics screen (mobile)** — client-side compute over cached tasks/reminders/focus stats; port `lib/analytics.ts`.
14. **Calendar screen (mobile)** — month grid + day panel + create-task-for-date (needs Create Task due-date wiring from task 2).
15. **Notes screen (mobile)** — CRUD against `/notes`.
16. **AI Daily Planner (mobile)** — phased: (a) generate+render plan, (b) accept/restore, (c) preferences editor.

## Phase 3 — P3 polish

17. `initialType` prop for mobile `CreateReminderScreen`; person CTA preselects Person type.
18. Dashboard quick actions: "New Reminder" → create form; add Calendar action once #14 lands.
19. Delayed skeletons for tasks/focus/reminders lists.
20. Inline status select + success feedback in All Tasks rows.
21. Notification search box.
22. Feed All Tasks stat tiles from the shared query cache instead of the App-level prop.
23. Set up a mobile JS test runner (jest-expo or vitest) so the existing `*.test.ts` files actually execute in CI; add the navigation contract test from task 1.
24. Reconcile `navigationStructure.ts` with the shipped 5-tab navigator; delete the legacy `notifications` branch and duplicate back-handler once Stage 2 completes.
