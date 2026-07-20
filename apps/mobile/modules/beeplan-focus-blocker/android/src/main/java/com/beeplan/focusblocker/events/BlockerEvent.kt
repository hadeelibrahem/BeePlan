package com.beeplan.focusblocker.events

import com.beeplan.focusblocker.core.FocusStatus

/**
 * Events emitted by the native core toward JavaScript. Modeled as a sealed
 * hierarchy so the module's collector is exhaustive and new event types are a
 * compile error until they are wired to `sendEvent`.
 */
sealed interface BlockerEvent {
  data class StatusChanged(val status: FocusStatus) : BlockerEvent

  data class BlockAttempt(
    val sessionId: String,
    val packageName: String,
    val appName: String,
    val timestampMs: Long,
  ) : BlockerEvent

  data class SessionEnded(
    val sessionId: String,
    val reason: String,
  ) : BlockerEvent

  data class EmergencyExit(
    val sessionId: String,
    val reason: String,
    val timestampMs: Long,
  ) : BlockerEvent
}
