package com.beeplan.focusblocker.ui

import android.content.Context
import android.content.Intent
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.beeplan.focusblocker.core.BlockerController

/**
 * Full-screen "Stay Focused" wall shown when the user opens a blocked app.
 *
 * Launched exclusively via the full-screen-intent in [com.beeplan.focusblocker.notification.FocusNotificationManager],
 * declared `singleTask` + `noHistory` so it can never stack. All UI lives in
 * Compose ([BlockScreen]); this Activity only wires lifecycle → controller.
 */
class BlockActivity : ComponentActivity() {

  private var blockedPackage: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockscreen()

    val controller = BlockerController
    controller.initialize(applicationContext)
    blockedPackage = controller.activeBlockedPackage()

    val session = controller.currentSession()
    if (session == null) {
      // Session ended between the intent firing and us resuming — bail out.
      finish()
      return
    }

    val blockedApp = blockedPackage?.let { pkg ->
      BlockedAppUi(name = controller.appLabel(pkg), icon = loadIcon(pkg))
    }

    setContent {
      // endsAtMs is the single clock source; the composable derives the ticking
      // countdown and calls onExpired when it crosses zero.
      var done by remember { mutableStateOf(false) }
      BlockScreen(
        model = BlockScreenModel(
          appName = blockedApp?.name ?: "This app",
          appIcon = blockedApp?.icon,
          taskTitle = session.taskTitle,
          endsAtMs = session.endsAtMs,
          totalMs = (session.endsAtMs - session.startedAtMs).coerceAtLeast(1L),
          motivationalMessage = session.motivationalMessage.ifBlank { DEFAULT_MESSAGE },
          allowEmergencyExit = session.allowEmergencyExit,
        ),
        onReturnToApp = { returnToBeePlan() },
        onReallyNeed = { durationMs ->
          blockedPackage?.let { controller.allowTemporarily(it, durationMs) }
          finishAndRemove()
        },
        onExpired = {
          if (!done) {
            done = true
            finishAndRemove()
          }
        },
      )
    }
  }

  private fun returnToBeePlan() {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    runCatching { launch?.let(::startActivity) }
    finishAndRemove()
  }

  /** Finish and notify the controller so the block screen guard is released. */
  private fun finishAndRemove() {
    BlockerController.onBlockScreenDismissed(blockedPackage)
    finish()
  }

  override fun onDestroy() {
    // Safety net: if the Activity is torn down by any other path, release the
    // guard so a future launch of the same app can be blocked again.
    BlockerController.onBlockScreenDismissed(blockedPackage)
    super.onDestroy()
  }

  private fun loadIcon(pkg: String): Drawable? =
    runCatching { packageManager.getApplicationIcon(pkg) }.getOrNull()

  private fun showOverLockscreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
  }

  companion object {
    private const val DEFAULT_MESSAGE = "One tap away from breaking your streak. You've got this — stay with your task."

    fun launchIntent(context: Context): Intent =
      Intent(context, BlockActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
  }
}

private data class BlockedAppUi(val name: String, val icon: Drawable?)
