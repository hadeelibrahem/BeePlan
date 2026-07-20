package com.beeplan.focusblocker.detection

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

/**
 * Resolves the package currently in the foreground using [UsageStatsManager].
 *
 * We read the most recent `ACTIVITY_RESUMED` (a.k.a. MOVE_TO_FOREGROUND) event
 * inside a short trailing window. This is the reliable, non-deprecated approach
 * that works without an accessibility service — the same technique used by
 * Forest/Stay-Focused-style apps.
 */
class ForegroundAppDetector(context: Context) {
  private val usageStatsManager =
    context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

  /**
   * @return the package name of the last app moved to the foreground within the
   *   last [lookbackMs], or null if nothing usable was found (e.g. permission
   *   revoked mid-session, or the launcher is in front).
   */
  fun currentForegroundPackage(lookbackMs: Long = DEFAULT_LOOKBACK_MS): String? {
    val end = System.currentTimeMillis()
    val begin = end - lookbackMs
    val events = usageStatsManager.queryEvents(begin, end)
    val event = UsageEvents.Event()
    var latestPackage: String? = null
    var latestTime = Long.MIN_VALUE

    // queryEvents is not guaranteed ordered, so scan for the max-timestamp resume.
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND && event.timeStamp > latestTime) {
        latestTime = event.timeStamp
        latestPackage = event.packageName
      }
    }
    return latestPackage
  }

  private companion object {
    // Wide enough to survive a couple of missed polls, short enough to stay live.
    const val DEFAULT_LOOKBACK_MS = 5_000L
  }
}
