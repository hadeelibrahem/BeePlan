package com.beeplan.focusblocker.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.beeplan.focusblocker.core.BlockerController

/**
 * Restores an in-flight strict session after a reboot.
 *
 * [BlockerController.initialize] reads the persisted session from
 * device-protected storage (readable before unlock) and only restarts the
 * service when the session has not yet expired, so a phone that reboots after
 * the timer would have finished simply stays idle.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_LOCKED_BOOT_COMPLETED) return

    BlockerController.initialize(context.applicationContext)
    val session = BlockerController.currentSession() ?: return
    if (!session.isExpired()) {
      FocusBlockerService.start(context.applicationContext)
    }
  }
}
