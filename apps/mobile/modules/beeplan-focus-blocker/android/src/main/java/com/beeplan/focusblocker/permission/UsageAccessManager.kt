package com.beeplan.focusblocker.permission

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings

/**
 * Wraps the "Usage Access" special permission that `UsageStatsManager` requires.
 *
 * This is not a runtime permission — it can only be toggled by the user in
 * system settings — so we detect it via [AppOpsManager] and route the user to
 * the correct settings screen rather than prompting.
 */
class UsageAccessManager(private val context: Context) {

  /** True when this app currently holds Usage Access. */
  fun hasAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.unsafeCheckOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName,
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /**
   * Opens the system Usage Access list. We try to deep-link straight to our app
   * first and fall back to the generic list if the OEM rejects the data URI.
   */
  fun openSettings() {
    val direct = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
      data = android.net.Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val fallback = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(direct) }
      .recoverCatching { context.startActivity(fallback) }
  }
}
