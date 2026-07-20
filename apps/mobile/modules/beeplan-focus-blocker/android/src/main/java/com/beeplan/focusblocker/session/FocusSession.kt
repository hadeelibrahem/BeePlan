package com.beeplan.focusblocker.session

import org.json.JSONArray
import org.json.JSONObject

/**
 * Immutable description of a strict focus session.
 *
 * Time is stored as an absolute wall-clock end (`endsAtMs`) rather than a
 * ticking counter, so the remaining time is always correct after process death,
 * navigation, or reboot — mirroring the JS `useFocusSession` contract.
 */
data class FocusSession(
  val sessionId: String,
  val taskTitle: String?,
  val endsAtMs: Long,
  val blockedPackages: Set<String>,
  val motivationalMessage: String,
  val allowEmergencyExit: Boolean,
  val startedAtMs: Long,
  /**
   * When true the session is temporarily paused: the foreground service may stay
   * alive but all blocking checks are skipped and the timer is frozen. Persisted
   * so the paused state survives process/service recreation.
   */
  val paused: Boolean = false,
) {
  /** Remaining milliseconds relative to [now], clamped at zero. */
  fun remainingMs(now: Long = System.currentTimeMillis()): Long = (endsAtMs - now).coerceAtLeast(0L)

  /** True once the wall clock has passed the planned end. */
  fun isExpired(now: Long = System.currentTimeMillis()): Boolean = now >= endsAtMs

  fun toJson(): String = JSONObject().apply {
    put("sessionId", sessionId)
    put("taskTitle", taskTitle)
    put("endsAtMs", endsAtMs)
    put("blockedPackages", JSONArray(blockedPackages.toList()))
    put("motivationalMessage", motivationalMessage)
    put("allowEmergencyExit", allowEmergencyExit)
    put("startedAtMs", startedAtMs)
    put("paused", paused)
  }.toString()

  companion object {
    fun fromJson(raw: String): FocusSession? = runCatching {
      val obj = JSONObject(raw)
      val packagesJson = obj.optJSONArray("blockedPackages") ?: JSONArray()
      val packages = buildSet {
        for (i in 0 until packagesJson.length()) add(packagesJson.getString(i))
      }
      FocusSession(
        sessionId = obj.getString("sessionId"),
        taskTitle = obj.optString("taskTitle").takeUnless { obj.isNull("taskTitle") },
        endsAtMs = obj.getLong("endsAtMs"),
        blockedPackages = packages,
        motivationalMessage = obj.optString("motivationalMessage"),
        allowEmergencyExit = obj.optBoolean("allowEmergencyExit", true),
        startedAtMs = obj.optLong("startedAtMs", System.currentTimeMillis()),
        paused = obj.optBoolean("paused", false),
      )
    }.getOrNull()
  }
}
