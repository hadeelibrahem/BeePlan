package com.beeplan.focusblocker.apps

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import com.beeplan.focusblocker.core.InstalledApp
import java.io.ByteArrayOutputStream

/**
 * Enumerates apps that have a launcher entry (the only ones worth blocking) and
 * rasterises their icons to base64 PNG for the RN picker.
 *
 * Icon rasterisation is bounded to [ICON_SIZE_PX] to keep the bridge payload
 * small even on devices with hundreds of installed apps.
 */
class InstalledAppsProvider(private val context: Context) {

  fun launchableApps(): List<InstalledApp> {
    val pm = context.packageManager
    val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val resolved = pm.queryIntentActivities(launcherIntent, 0)

    return resolved
      .asSequence()
      .mapNotNull { it.activityInfo?.applicationInfo }
      .distinctBy { it.packageName }
      .filter { it.packageName != context.packageName } // never offer BeePlan itself
      .map { info -> info.toInstalledApp(pm) }
      .sortedBy { it.appName.lowercase() }
      .toList()
  }

  private fun ApplicationInfo.toInstalledApp(pm: PackageManager): InstalledApp {
    val label = runCatching { pm.getApplicationLabel(this).toString() }.getOrDefault(packageName)
    val icon = runCatching { pm.getApplicationIcon(this) }.getOrNull()
    return InstalledApp(
      packageName = packageName,
      appName = label,
      icon = icon?.let(::encodeIcon),
      system = flags and ApplicationInfo.FLAG_SYSTEM != 0,
    )
  }

  private fun encodeIcon(drawable: Drawable): String? = runCatching {
    val bitmap = drawable.toSizedBitmap(ICON_SIZE_PX)
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    "data:image/png;base64,${Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)}"
  }.getOrNull()

  private fun Drawable.toSizedBitmap(size: Int): Bitmap {
    if (this is BitmapDrawable && bitmap != null) {
      return Bitmap.createScaledBitmap(bitmap, size, size, true)
    }
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    setBounds(0, 0, canvas.width, canvas.height)
    draw(canvas)
    return bitmap
  }

  private companion object {
    const val ICON_SIZE_PX = 96
  }
}
