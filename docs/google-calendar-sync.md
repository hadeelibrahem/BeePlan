# Google Calendar synchronization

BeePlan keeps Google Calendar integration in its own bounded context under
`apps/api/src/google-calendar`.

## Flow

1. An authenticated user requests `GET /google-calendar/connect`.
2. The API creates a short-lived signed OAuth state and redirects to Google
   with offline access and the Calendar events scope.
3. Google returns to `GET /google-calendar/callback`; the API exchanges the
   code, stores the account email and refresh token, then discovers every
   calendar the account can read.
4. Calendar selection is persisted in `google_calendars.selected`. Only
   selected calendars are read during event sync.
5. `POST /google-calendar/sync` imports events into
   `google_calendar_events`. The provider calendar id plus event id is the
   durable external identity, so repeated syncs update instead of duplicating.
   Cancelled events are removed from the local mirror.
6. Imported events are exposed by `GET /google-calendar/events` and are also
   converted into hard busy windows by `RecurringCommitmentsService`. The AI
   planner therefore treats meetings, classes, and appointments like existing
   BeePlan commitments.

## Settings API

- `GET /google-calendar/status`
- `GET /google-calendar/calendars`
- `PUT /google-calendar/calendars` with `{ calendarIds: string[] }`
- `PUT /google-calendar/settings` with sync direction and reminder defaults
- `POST /google-calendar/sync`
- `DELETE /google-calendar/disconnect`

The web Settings screen provides connect/disconnect, account display, calendar
selection, sync direction, and manual sync. The BeePlan calendar shows selected
Google events as blue protected-time items.

## Outbound ownership and queue

Scheduled tasks enqueue `upsert` jobs after the task write completes; deleted or
unscheduled tasks enqueue `delete` jobs. A cron worker processes jobs separately
from the task transaction with exponential backoff. The local event mapping
stores both the Google calendar id and event id, plus the last etag returned by
Google. A mapping is marked `beeplan_exported` only when BeePlan created it.

Imported events remain `google_imported` and are never changed or deleted by a
BeePlan task operation. Exported mappings can become `conflict` when Google's
etag changes; those jobs stop retrying until a user chooses a resolution. A
disconnect cascades queued jobs and mappings through the connection boundary.

Outbound candidates use the shared `CalendarSyncCandidate` contract and queue
coordinator. Scheduled tasks, persisted non-transient focus sessions, and
timed reminders now enqueue through the coordinator. Purely triggered reminders
and active/paused transient focus timers are marked ineligible and remove any
prior BeePlan-owned export. Custom calendar blocks are represented in the
settings contract but are disabled until BeePlan has a persistent block entity.

Each connection exposes safe per-entity export flags. Defaults are scheduled
tasks on, focus sessions on, timed reminders off, and calendar blocks on when
that entity exists. Recurrence is intentionally not synthesized unless the
entity has a safe generated occurrence mapping; recurring outbound sync remains
unsupported in this stage.

## Data safety

Tokens are stored only in the API database and are never sent to the browser.
All calendar and event queries are scoped by the authenticated user id. A
calendar is never read after it is unselected. Event payloads retain recurrence,
attendee, timezone, all-day, and location data for future occurrence-level
editing and conflict actions.

## Deployment configuration

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GOOGLE_CALENDAR_CALLBACK_URL` to the callback registered in Google Cloud.
`FRONTEND_URL` (or `WEB_APP_URL`) is used after the callback to return to
Settings.

## Incremental inbound synchronization

Inbound state is stored per selected row in `google_calendars`, including
`next_sync_token`, full/success timestamps, status, error, and a short lease.
The first run follows every `nextPageToken` and saves the returned
`nextSyncToken` only after all pages reconcile successfully. Later runs use
that calendar's token. HTTP 410 clears only that calendar's token and retries a
full reconciliation; the account remains connected.

Cancelled imported events are retained as `status = deleted` for audit safety
and disappear from planner busy windows. BeePlan-owned mappings are not deleted
when Google cancels their mirror. Recurring event occurrences retain their
Google event id and raw `originalStartTime`/recurrence metadata in the event
payload, so distinct occurrences are not merged.

The per-calendar lease prevents overlapping syncs and expires after two
minutes so a crashed worker can recover. Manual sync returns a per-calendar
result. Recurring outbound synthesis remains unsupported.
