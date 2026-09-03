package com.beeplan.focusblocker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppGuardRequestGateTest {
  @Test fun `one tap acquires one request and rapid taps mint no extra ids`() {
    val gate = AppGuardRequestGate()
    var idsMinted = 0
    val first = gate.begin { idsMinted += 1; "request-$idsMinted" }
    val second = gate.begin { idsMinted += 1; "request-$idsMinted" }

    assertEquals("request-1", first)
    assertNull(second)
    assertEquals(1, idsMinted)
    assertEquals("request-1", gate.activeId())
  }

  @Test fun `terminal completion allows one explicit retry with a new id`() {
    val gate = AppGuardRequestGate()
    assertEquals("request-1", gate.begin { "request-1" })
    assertFalse(gate.finish("stale-request"))
    assertTrue(gate.finish("request-1"))
    assertEquals("request-2", gate.begin { "request-2" })
  }
}
