package com.beeplan.focusblocker.service

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import com.beeplan.focusblocker.core.BlockerController
import com.beeplan.focusblocker.detection.ForegroundAppDetector
import com.beeplan.focusblocker.notification.FocusNotificationManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Foreground service that polls the current foreground app while a strict
 * session is running and drives the block decision through [BlockerController].
 *
 * Reliability guarantees:
 *  - Single instance: `startForegroundService` is idempotent; a duplicate START
 *    simply re-affirms foreground state and never spawns a second loop.
 *  - No infinite spin on failure: the loop uses a fixed [POLL_INTERVAL_MS] delay
 *    and every OS call is wrapped so a transient error skips one tick, not the
 *    whole service.
 *  - No leaks: the polling coroutine lives on a service-scoped [SupervisorJob]
 *    that is cancelled in [onDestroy].
 */
class FocusBlockerService : Service() {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var pollJob: Job? = null
  private lateinit var detector: ForegroundAppDetector
  private lateinit var notifications: FocusNotificationManager

  override fun onCreate() {
    super.onCreate()
    BlockerController.initialize(applicationContext)
    detector = ForegroundAppDetector(applicationContext)
    notifications = BlockerController.notifications
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }
      else -> startMonitoring()
    }
    // START_STICKY so the OS relaunches us (with a null intent) after being
    // killed; onCreate + a persisted session let us resume transparently.
    return START_STICKY
  }

  private fun startMonitoring() {
    val session = BlockerController.currentSession()
    if (session == null) {
      // Relaunched with no session to resume — nothing to do.
      stopSelf()
      return
    }
    promoteToForeground(notifications.buildOngoing(session))

    if (pollJob?.isActive == true) return // already monitoring; stay single-instance
    pollJob = scope.launch {
      var lastShownSecond = -1L
      while (isActive) {
        val foreground = runCatching { detector.currentForegroundPackage() }.getOrNull()
        val live = BlockerController.onTick(foreground)
        if (live == null) {
          // Session finished/cancelled inside onTick.
          stopForegroundCompat()
          stopSelf()
          break
        }
        val second = live.remainingMs() / 1000
        if (second != lastShownSecond) {
          lastShownSecond = second
          runCatching { notifications.updateOngoing(live) }
        }
        delay(POLL_INTERVAL_MS)
      }
    }
  }

  private fun promoteToForeground(notification: android.app.Notification) {
    // The `specialUse` type + constant only exist on API 34+. On 29–33 the 3-arg
    // call would reject an undeclared type, so fall back to the untyped overload.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        FocusNotificationManager.NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(FocusNotificationManager.NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  override fun onDestroy() {
    pollJob?.cancel()
    scope.cancel()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val ACTION_START = "com.beeplan.focusblocker.action.START"
    private const val ACTION_STOP = "com.beeplan.focusblocker.action.STOP"
    private const val POLL_INTERVAL_MS = 600L

    fun start(context: Context) {
      val intent = Intent(context, FocusBlockerService::class.java).setAction(ACTION_START)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      val intent = Intent(context, FocusBlockerService::class.java).setAction(ACTION_STOP)
      // Route through the service so it can tear down foreground state cleanly.
      runCatching { context.startService(intent) }
    }
  }
}
