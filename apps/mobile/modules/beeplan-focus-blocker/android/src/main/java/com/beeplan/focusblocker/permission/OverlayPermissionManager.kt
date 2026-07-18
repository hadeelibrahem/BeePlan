package com.beeplan.focusblocker.permission

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Wraps the "Display over other apps" (SYSTEM_ALERT_WINDOW) special permission.
 *
 * This is what makes the block screen reliably appear on top of the distracting
 * app under current Android restrictions: an app that can draw overlays is also
 * exempt from background-activity-launch limits, so the foreground service can
 * bring [com.beeplan.focusblocker.ui.BlockActivity] to the front. On Android 14+
 * this is the only dependable path — full-screen intents are reserved for
 * calling/alarm apps.
 */
class OverlayPermissionManager(private val context: Context) {

  /** True when we may draw over other apps (always true below API 23). */
  fun canDrawOverlays(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

  /** Opens the per-app "Display over other apps" settings screen. */
  fun openSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val fallback = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
      .recoverCatching { context.startActivity(fallback) }
  }
}
