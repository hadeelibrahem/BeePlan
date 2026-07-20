package com.beeplan.focusblocker.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.beeplan.focusblocker.session.FocusSession
import com.beeplan.focusblocker.ui.BlockActivity
import java.util.concurrent.TimeUnit

/**
 * Owns the ongoing foreground notification and the high-priority full-screen
 * intent used to raise the block screen.
 *
 * The notification is `ongoing` + non-dismissible so it cannot accidentally
 * disappear while a strict session is running, satisfying the "notification
 * cannot accidentally disappear" requirement.
 */
class FocusNotificationManager(private val context: Context) {

  private val manager =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  init {
    ensureChannels()
  }

  private fun ensureChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val ongoing = NotificationChannel(
      CHANNEL_ONGOING,
      "Focus session",
      NotificationManager.IMPORTANCE_LOW, // silent, but persistent
    ).apply {
      description = "Shows while Strict Focus Mode is active"
      setShowBadge(false)
      setSound(null, null)
    }
    val block = NotificationChannel(
      CHANNEL_BLOCK,
      "Focus block screen",
      NotificationManager.IMPORTANCE_HIGH, // required for full-screen intents
    ).apply {
      description = "Raises the Stay Focused screen when a blocked app opens"
      setShowBadge(false)
    }
    manager.createNotificationChannel(ongoing)
    manager.createNotificationChannel(block)
  }

  /** Builds the persistent foreground notification for the running session. */
  fun buildOngoing(session: FocusSession): Notification {
    val remaining = formatRemaining(session.remainingMs())
    val title = session.taskTitle?.takeIf { it.isNotBlank() } ?: "Focus session"
    return baseBuilder(CHANNEL_ONGOING)
      .setContentTitle("Strict Mode active · $remaining left")
      .setContentText(title)
      .setStyle(Notification.BigTextStyle().bigText("$title\n$remaining remaining · stay focused"))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openAppIntent())
      .build()
  }

  /** Pushes an updated remaining-time value onto the live notification. */
  fun updateOngoing(session: FocusSession) {
    manager.notify(NOTIFICATION_ID, buildOngoing(session))
  }

  /**
   * Fires a heads-up full-screen-intent notification whose fullScreenIntent
   * launches [BlockActivity]. This is the reliable way to bring an Activity to
   * the front from a background context on modern Android.
   */
  fun raiseBlockScreen(session: FocusSession) {
    val fullScreen = BlockActivity.launchIntent(context)
    val pending = PendingIntent.getActivity(
      context,
      REQUEST_BLOCK,
      fullScreen,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = baseBuilder(CHANNEL_BLOCK)
      .setContentTitle("Stay Focused")
      .setContentText("A blocked app was opened during your focus session")
      .setCategory(Notification.CATEGORY_ALARM)
      .setFullScreenIntent(pending, true)
      .setAutoCancel(true)
      .build()
    manager.notify(BLOCK_NOTIFICATION_ID, notification)
  }

  fun clearBlockScreen() = manager.cancel(BLOCK_NOTIFICATION_ID)

  private fun baseBuilder(channel: String): Notification.Builder {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    return builder
      .setSmallIcon(context.applicationInfo.icon)
      .setPriority(Notification.PRIORITY_LOW)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
  }

  private fun openAppIntent(): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN)
    return PendingIntent.getActivity(
      context,
      REQUEST_OPEN_APP,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun formatRemaining(ms: Long): String {
    val totalSeconds = TimeUnit.MILLISECONDS.toSeconds(ms)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
  }

  companion object {
    const val NOTIFICATION_ID = 0xB33F
    private const val BLOCK_NOTIFICATION_ID = 0xB340
    const val CHANNEL_ONGOING = "beeplan_focus_ongoing"
    const val CHANNEL_BLOCK = "beeplan_focus_block"
    private const val REQUEST_OPEN_APP = 1001
    private const val REQUEST_BLOCK = 1002
  }
}
