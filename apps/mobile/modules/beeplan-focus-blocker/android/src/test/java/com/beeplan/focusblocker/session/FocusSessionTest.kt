package com.beeplan.focusblocker.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Serialization tests for [FocusSession]. This is the mechanism that lets the
 * paused state survive foreground-service / process recreation: the service
 * rehydrates the session from SharedPreferences via [SessionStore], which stores
 * exactly this JSON.
 */
class FocusSessionTest {

  private fun sample(paused: Boolean) = FocusSession(
    sessionId = "s1",
    taskTitle = "Write report",
    endsAtMs = 1_800_000L,
    blockedPackages = setOf("com.instagram.android", "com.twitter.android"),
    motivationalMessage = "Stay focused",
    allowEmergencyExit = true,
    startedAtMs = 1_000_000L,
    paused = paused,
  )

  @Test
  fun `paused true survives a JSON round-trip (service recreation)`() {
    val restored = FocusSession.fromJson(sample(paused = true).toJson())
    assertEquals(sample(paused = true), restored)
    assertTrue(restored!!.paused)
  }

  @Test
  fun `paused false survives a JSON round-trip`() {
    val restored = FocusSession.fromJson(sample(paused = false).toJson())
    assertEquals(sample(paused = false), restored)
    assertFalse(restored!!.paused)
  }

  @Test
  fun `legacy session without a paused field defaults to not paused`() {
    // Sessions persisted before this feature shipped have no "paused" key.
    val legacyJson = """
      {"sessionId":"s1","taskTitle":"Write report","endsAtMs":1800000,
       "blockedPackages":["com.instagram.android"],"motivationalMessage":"Stay focused",
       "allowEmergencyExit":true,"startedAtMs":1000000}
    """.trimIndent()
    val restored = FocusSession.fromJson(legacyJson)
    assertFalse(restored!!.paused)
  }
}
