# beeplan-widget

Android home-screen widget — **"What should I do now?"**. A local Expo native
module (Kotlin + Jetpack Glance) that always shows the user's most useful next
action.

## Architecture

```
RN app ──buildWidgetSnapshot()──▶ setWidgetSnapshot(json)
   (src/lib/widgetSnapshot.ts)         │  (src/lib/widgetSync.ts)
                                        ▼
                          BeePlanWidgetModule (Kotlin, Expo)
                                        │  WidgetStore (SharedPreferences)
                                        ▼  + BeePlanWidget().updateAll()
                          BeePlanWidget (GlanceAppWidget)
                                        │  reads stored snapshot
                                        ▼
                          BeePlanWidgetRenderer (Glance @Composable)
```

- **One mapper, one payload.** The React Native side is the only place a widget
  payload is built (`buildWidgetSnapshot`, tested in `widgetSnapshot.test.ts`)
  and pushed (`widgetSync`). No recommendation/task-selection logic exists in
  Kotlin — the widget only renders what `/dashboard/today` already decided.
- **Contract:** `src/types.ts` (`BeePlanWidgetSnapshot`) is the single source of
  truth for the payload shape, consumed by both the mapper and the bridge.
- **Storage:** a single render-only JSON string in SharedPreferences. **No auth
  token or sensitive data is ever stored.** Logout pushes the `signed-out`
  snapshot, overwriting any prior task details.

## States

`recommendation` · `focus-active` · `completed-next` · `day-complete` ·
`signed-out` · `empty`. Active Focus always overrides the recommendation.

## Branding & mascot

The widget uses the real BeePlan brand identity, reproduced from the app's
`BeePlanLogo` component (`apps/mobile/src/components/BeePlanLogo.tsx`) — a yellow
(`#fdef4b`) tilted rounded-square bee with dark (`#2b323f`) stripes and antenna
dots, and the two-tone "Bee" (white) + "Plan" (yellow) wordmark. That lockup is
designed for a dark surface, so the widget renders on a premium **dark slate
card** (`#2b323f`) with brand yellow as the accent (headings + primary button).

Every state renders a branded header — logo (`res/drawable/beeplan_logo.xml`) +
two-tone wordmark on the left, state-specific bee mascot on the right. The header
is a tap target (resume when focusing, else open dashboard) via the existing
deep-link builders.

The mascot is the **same brand bee**, re-posed as a **state-based still** — not
an animation (Android AppWidget / RemoteViews cannot run continuous or Lottie
animation, and per-second refresh is forbidden). It changes only when the
snapshot state changes:

| State | Drawable | Pose |
|---|---|---|
| recommendation | `bee_idle` | resting wings |
| focus-active | `bee_focusing` | wings raised + motion lines |
| completed-next / day-complete | `bee_celebrating` | sparkles |
| signed-out / empty | `bee_sleeping` | relaxed wings + Z's |

The mascot hides on narrow widths (`< 200dp`) so it never crowds the title. Logo
and all four mascots are clean local vector drawables built from the brand bee —
no emoji, no raster, no network.

## Refresh & time

No per-second background refresh. The widget repaints on: an app state change
(`setSnapshot` → `updateAll`), add/resize, and a 30-minute OS heartbeat
(`updatePeriodMillis`). The Focus countdown is recomputed from an absolute
`focusEndsAt` at render time and is an **approximate status** — the in-app Focus
timer stays authoritative.

## Timezone limitation

Due-date labels are computed in `widgetSnapshot.ts` using the dashboard's
`timezone`, so they follow the API's day boundaries rather than a widget-only
calculation. This inherits the project's current UTC-leaning dashboard
convention; if/when timezone handling is centralized in the API aggregation, the
widget needs no change.

## Deep links

`beeplan://dashboard`, `beeplan://focus?action=start&taskId=…&subtaskId=…`,
`beeplan://focus?action=resume&sessionId=…`. Routed by the existing React
Navigation `linking` config. The widget never starts a session itself — "start"
opens the Focus flow with the unit preselected so existing validation runs.
