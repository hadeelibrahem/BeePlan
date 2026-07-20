package com.beeplan.focusblocker.stats

import org.json.JSONObject

/** One recorded attempt to open a blocked app during a session. */
data class BlockEvent(
  val sessionId: String,
  val packageName: String,
  val appName: String,
  val timestampMs: Long,
  val interruptedMs: Long,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "sessionId" to sessionId,
    "packageName" to packageName,
    "appName" to appName,
    "timestampMs" to timestampMs.toDouble(),
    "interruptedMs" to interruptedMs.toDouble(),
  )

  fun toJson(): JSONObject = JSONObject().apply {
    put("sessionId", sessionId)
    put("packageName", packageName)
    put("appName", appName)
    put("timestampMs", timestampMs)
    put("interruptedMs", interruptedMs)
  }

  companion object {
    fun fromJson(obj: JSONObject) = BlockEvent(
      sessionId = obj.getString("sessionId"),
      packageName = obj.getString("packageName"),
      appName = obj.optString("appName", obj.getString("packageName")),
      timestampMs = obj.getLong("timestampMs"),
      interruptedMs = obj.optLong("interruptedMs", 0L),
    )
  }
}
