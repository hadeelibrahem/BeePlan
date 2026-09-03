package com.beeplan.focusblocker.core

import org.junit.Assert.assertEquals
import org.junit.Test

class AppGuardHttpFailureTest {
  @Test fun `recognized rate limit maps to a clear fail closed message`() {
    assertEquals(AppGuardHttpFailure.RATE_LIMIT_MESSAGE, AppGuardHttpFailure.message(429, "{\"code\":\"APP_GUARD_RATE_LIMITED\"}"))
  }

  @Test fun `unrecognized failures do not surface server messages`() {
    assertEquals("We couldn't review your request right now. This app remains restricted.", AppGuardHttpFailure.message(500, "{\"message\":\"database password\"}"))
  }
}
