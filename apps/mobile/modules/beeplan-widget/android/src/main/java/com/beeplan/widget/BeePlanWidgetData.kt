package com.beeplan.widget

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * The widget's render state. Mirrors the TypeScript `WidgetState` union so the
 * mapper (mobile) and renderer (native) agree on the exact set of states.
 */
enum class WidgetState(val wire: String) {
  RECOMMENDATION("recommendation"),
  FOCUS_ACTIVE("focus-active"),
  COMPLETED_NEXT("completed-next"),
  DAY_COMPLETE("day-complete"),
  SIGNED_OUT("signed-out"),
  EMPTY("empty");

  companion object {
    fun fromWire(value: String?): WidgetState =
      values().firstOrNull { it.wire == value } ?: EMPTY
  }
}

/**
 * Flat, render-only mirror of the TS `BeePlanWidgetSnapshot`. Every field is
 * safe to persist — there is deliberately no auth token or sensitive data here.
 * Time-critical values are kept as absolute epoch-millis (parsed once here) so
 * the renderer can recompute the Focus countdown and staleness label without
 * re-parsing ISO strings on every draw.
 */
data class WidgetSnapshot(
  val state: WidgetState = WidgetState.EMPTY,
  val updatedAtMs: Long? = null,
  val title: String? = null,
  val taskId: String? = null,
  val subtaskId: String? = null,
  val estimatedMinutes: Int? = null,
  val remainingMinutes: Int? = null,
  val priority: String? = null,
  val dueLabel: String? = null,
  val whyNow: String? = null,
  val focusSessionId: String? = null,
  val focusEndsAtMs: Long? = null,
  val nextTitle: String? = null,
  val nextTaskId: String? = null,
  val nextSubtaskId: String? = null,
  val nextEstimatedMinutes: Int? = null,
  val todayProgressPercent: Int? = null,
  val todayFocusMinutes: Int? = null,
) {
  companion object {
    /** The safe default when no data has ever been pushed. */
    val EMPTY = WidgetSnapshot(state = WidgetState.EMPTY)

    /**
     * Parse a snapshot JSON string produced by the mobile mapper. Returns the
     * [EMPTY] snapshot for null/blank/invalid input rather than throwing — the
     * widget must always have something safe to render.
     */
    fun parse(json: String?): WidgetSnapshot {
      if (json.isNullOrBlank()) return EMPTY
      return try {
        val obj = JSONObject(json)
        WidgetSnapshot(
          state = WidgetState.fromWire(obj.optStringOrNull("state")),
          updatedAtMs = parseIsoUtc(obj.optStringOrNull("updatedAt")),
          title = obj.optStringOrNull("title"),
          taskId = obj.optStringOrNull("taskId"),
          subtaskId = obj.optStringOrNull("subtaskId"),
          estimatedMinutes = obj.optIntOrNull("estimatedMinutes"),
          remainingMinutes = obj.optIntOrNull("remainingMinutes"),
          priority = obj.optStringOrNull("priority"),
          dueLabel = obj.optStringOrNull("dueLabel"),
          whyNow = obj.optStringOrNull("whyNow"),
          focusSessionId = obj.optStringOrNull("focusSessionId"),
          focusEndsAtMs = parseIsoUtc(obj.optStringOrNull("focusEndsAt")),
          nextTitle = obj.optStringOrNull("nextTitle"),
          nextTaskId = obj.optStringOrNull("nextTaskId"),
          nextSubtaskId = obj.optStringOrNull("nextSubtaskId"),
          nextEstimatedMinutes = obj.optIntOrNull("nextEstimatedMinutes"),
          todayProgressPercent = obj.optIntOrNull("todayProgressPercent"),
          todayFocusMinutes = obj.optIntOrNull("todayFocusMinutes"),
        )
      } catch (_: Exception) {
        EMPTY
      }
    }

    /**
     * Parse an ISO-8601 UTC timestamp (always emitted by JS `toISOString()`,
     * e.g. `2026-07-23T12:00:00.000Z`) to epoch millis. Uses SimpleDateFormat so
     * no `java.time` desugaring is required at minSdk 24. Null on failure.
     */
    fun parseIsoUtc(value: String?): Long? {
      if (value.isNullOrBlank()) return null
      return try {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        fmt.parse(value)?.time
      } catch (_: Exception) {
        // Tolerate a millisecond-less variant just in case.
        try {
          val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
          fmt.timeZone = TimeZone.getTimeZone("UTC")
          fmt.parse(value)?.time
        } catch (_: Exception) {
          null
        }
      }
    }

    /**
     * Format the Focus countdown from an absolute end time. `mm:ss` under an
     * hour, `h:mm:ss` otherwise. Clamped at `0:00` — never negative — because a
     * widget refresh can land after the session's planned end.
     */
    fun formatRemaining(endsAtMs: Long?, nowMs: Long): String {
      if (endsAtMs == null) return "0:00"
      val totalSeconds = ((endsAtMs - nowMs) / 1000L).coerceAtLeast(0L)
      val hours = totalSeconds / 3600
      val minutes = (totalSeconds % 3600) / 60
      val seconds = totalSeconds % 60
      return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
      } else {
        String.format(Locale.US, "%d:%02d", minutes, seconds)
      }
    }

    /**
     * Short "Updated Xm/Xh/Xd ago" staleness label from the snapshot timestamp,
     * or null when fresh (< 1 min) or unknown. Never shown as an error — cached
     * content stays visible, this is just an optional freshness hint.
     */
    fun formatUpdatedAgo(updatedAtMs: Long?, nowMs: Long): String? {
      if (updatedAtMs == null) return null
      val deltaMs = nowMs - updatedAtMs
      if (deltaMs < 60_000L) return null
      val minutes = deltaMs / 60_000L
      if (minutes < 60) return "Updated ${minutes}m ago"
      val hours = minutes / 60
      if (hours < 24) return "Updated ${hours}h ago"
      val days = hours / 24
      return "Updated ${days}d ago"
    }
  }
}

private fun JSONObject.optStringOrNull(key: String): String? {
  if (!has(key) || isNull(key)) return null
  val value = optString(key, "")
  return value.ifBlank { null }
}

private fun JSONObject.optIntOrNull(key: String): Int? {
  if (!has(key) || isNull(key)) return null
  return optInt(key)
}

/**
 * Persists the single widget snapshot JSON. SharedPreferences (not DataStore)
 * is deliberate: the payload is one small string, writes must survive process
 * death for the widget to render after the app is killed, and a synchronous
 * read keeps `provideGlance` simple. No token is ever written here.
 */
object WidgetStore {
  private const val PREFS = "beeplan_widget_store"
  private const val KEY_SNAPSHOT = "snapshot_json"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(context: Context, json: String) {
    prefs(context).edit().putString(KEY_SNAPSHOT, json).apply()
  }

  fun load(context: Context): WidgetSnapshot =
    WidgetSnapshot.parse(prefs(context).getString(KEY_SNAPSHOT, null))

  fun clear(context: Context) {
    prefs(context).edit().remove(KEY_SNAPSHOT).apply()
  }
}
