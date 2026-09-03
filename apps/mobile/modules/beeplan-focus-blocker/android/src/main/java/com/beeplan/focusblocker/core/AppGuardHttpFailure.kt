package com.beeplan.focusblocker.core

import org.json.JSONObject

internal object AppGuardHttpFailure {
  const val RATE_LIMIT_MESSAGE = "Too many requests. Try again shortly."

  /** Never returns server-provided text except the fixed, recognized rate-limit message. */
  fun message(status: Int, responseText: String?): String {
    if (status == 429 && runCatching {
        JSONObject(responseText ?: "{}").optString("code") == "APP_GUARD_RATE_LIMITED"
      }.getOrDefault(false)) return RATE_LIMIT_MESSAGE
    return "We couldn't review your request right now. This app remains restricted."
  }
}
