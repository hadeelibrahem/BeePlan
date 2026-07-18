package com.beeplan.focusblocker.stats

import android.content.Context
import org.json.JSONArray
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Append-only, bounded log of block events backed by SharedPreferences.
 *
 * A [ReentrantLock] serialises the read-modify-write cycle so events recorded
 * from the detection coroutine and the block activity never clobber each other.
 * The log is capped at [MAX_EVENTS] to bound storage growth.
 */
class BlockEventStore(context: Context) {
  private val prefs = context.applicationContext
    .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val lock = ReentrantLock()

  fun record(event: BlockEvent) = lock.withLock {
    val array = readArray()
    array.put(event.toJson())
    val trimmed = if (array.length() > MAX_EVENTS) {
      JSONArray().apply {
        for (i in (array.length() - MAX_EVENTS) until array.length()) put(array.get(i))
      }
    } else {
      array
    }
    prefs.edit().putString(KEY_EVENTS, trimmed.toString()).apply()
  }

  /** All events, newest last, optionally filtered to one session. */
  fun events(sessionId: String? = null): List<BlockEvent> = lock.withLock {
    val array = readArray()
    buildList {
      for (i in 0 until array.length()) {
        val event = runCatching { BlockEvent.fromJson(array.getJSONObject(i)) }.getOrNull() ?: continue
        if (sessionId == null || event.sessionId == sessionId) add(event)
      }
    }
  }

  /** Statistics map matching the JS `BlockStatistics` shape. */
  fun statistics(sessionId: String?): Map<String, Any?> {
    val events = events(sessionId)
    val byPackage = events
      .groupBy { it.packageName }
      .map { (pkg, group) ->
        mapOf(
          "packageName" to pkg,
          "appName" to group.first().appName,
          "attempts" to group.size,
        )
      }
      .sortedByDescending { it["attempts"] as Int }
    return mapOf(
      "sessionId" to sessionId,
      "totalAttempts" to events.size,
      "totalInterruptedMs" to events.sumOf { it.interruptedMs }.toDouble(),
      "byPackage" to byPackage,
      "events" to events.map { it.toMap() },
    )
  }

  private fun readArray(): JSONArray =
    runCatching { JSONArray(prefs.getString(KEY_EVENTS, "[]")) }.getOrDefault(JSONArray())

  companion object {
    private const val PREFS = "beeplan_focus_blocker_stats"
    private const val KEY_EVENTS = "block_events"
    private const val MAX_EVENTS = 500
  }
}
