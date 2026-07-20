package com.beeplan.focusblocker.core

/**
 * A launchable application surfaced to the block-list picker.
 *
 * @property icon base64 PNG data URI, or null when rasterisation failed. We
 *   deliberately keep the icon here (not just a label) so the RN picker can show
 *   a faithful list without a second round-trip to the native side.
 */
data class InstalledApp(
  val packageName: String,
  val appName: String,
  val icon: String?,
  val system: Boolean,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "packageName" to packageName,
    "appName" to appName,
    "icon" to icon,
    "system" to system,
  )
}
