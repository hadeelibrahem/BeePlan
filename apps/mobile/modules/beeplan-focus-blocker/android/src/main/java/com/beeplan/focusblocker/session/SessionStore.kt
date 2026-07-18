package com.beeplan.focusblocker.session

import android.content.Context

/**
 * Durable single-slot persistence for the active session.
 *
 * Uses device-protected storage so [com.beeplan.focusblocker.service.BootReceiver]
 * can read it after `LOCKED_BOOT_COMPLETED`, before the user unlocks the device.
 */
class SessionStore(context: Context) {
  private val prefs = context
    .createDeviceProtectedStorageContext()
    .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(session: FocusSession) {
    prefs.edit().putString(KEY_SESSION, session.toJson()).apply()
  }

  fun load(): FocusSession? = prefs.getString(KEY_SESSION, null)?.let(FocusSession::fromJson)

  fun clear() {
    prefs.edit().remove(KEY_SESSION).apply()
  }

  companion object {
    private const val PREFS = "beeplan_focus_blocker_session"
    private const val KEY_SESSION = "active_session"
  }
}
