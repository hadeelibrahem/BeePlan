package com.beeplan.focusblocker.core

/**
 * Snapshot of blocker state mirrored to JS. Field names map 1:1 to the
 * `FocusBlockerStatus` TypeScript type; keep the two in lockstep.
 */
data class FocusStatus(
  val isActive: Boolean,
  val strict: Boolean,
  val isPaused: Boolean,
  val sessionId: String?,
  val taskTitle: String?,
  val endsAtMs: Long?,
  val remainingMs: Long,
  val blockedPackages: List<String>,
  val hasUsageAccess: Boolean,
  val canDrawOverlays: Boolean,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "isActive" to isActive,
    "strict" to strict,
    "isPaused" to isPaused,
    "sessionId" to sessionId,
    "taskTitle" to taskTitle,
    // endsAtMs / remainingMs cross the bridge as Doubles to avoid Long truncation.
    "endsAtMs" to endsAtMs?.toDouble(),
    "remainingMs" to remainingMs.toDouble(),
    "blockedPackages" to blockedPackages,
    "hasUsageAccess" to hasUsageAccess,
    "canDrawOverlays" to canDrawOverlays,
  )

  companion object {
    fun idle(hasUsageAccess: Boolean, canDrawOverlays: Boolean) = FocusStatus(
      isActive = false,
      strict = false,
      isPaused = false,
      sessionId = null,
      taskTitle = null,
      endsAtMs = null,
      remainingMs = 0L,
      blockedPackages = emptyList(),
      hasUsageAccess = hasUsageAccess,
      canDrawOverlays = canDrawOverlays,
    )
  }
}
