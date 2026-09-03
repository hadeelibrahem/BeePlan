package com.beeplan.focusblocker.core

/**
 * Owns one logical App Guard submission. The ID factory is invoked only after
 * the gate is acquired, so ignored rapid taps cannot mint request IDs.
 */
internal class AppGuardRequestGate {
  private var activeRequestId: String? = null

  @Synchronized
  fun begin(newRequestId: () -> String): String? {
    if (activeRequestId != null) return null
    return newRequestId().also { activeRequestId = it }
  }

  @Synchronized
  fun activeId(): String? = activeRequestId

  @Synchronized
  fun finish(requestId: String): Boolean {
    if (activeRequestId != requestId) return false
    activeRequestId = null
    return true
  }
}
