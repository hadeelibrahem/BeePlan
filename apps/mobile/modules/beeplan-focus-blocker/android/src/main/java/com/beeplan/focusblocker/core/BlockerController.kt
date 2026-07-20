package com.beeplan.focusblocker.core

import android.content.Context
import android.util.Log
import com.beeplan.focusblocker.events.BlockerEvent
import com.beeplan.focusblocker.events.BlockerEventBus
import com.beeplan.focusblocker.notification.FocusNotificationManager
import com.beeplan.focusblocker.permission.OverlayPermissionManager
import com.beeplan.focusblocker.permission.UsageAccessManager
import com.beeplan.focusblocker.service.FocusBlockerService
import com.beeplan.focusblocker.ui.BlockActivity
import com.beeplan.focusblocker.session.FocusSession
import com.beeplan.focusblocker.session.SessionStore
import com.beeplan.focusblocker.stats.BlockEvent
import com.beeplan.focusblocker.stats.BlockEventStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Single source of truth for strict focus mode.
 *
 * Deliberately the *only* stateful singleton in the module: the Expo module, the
 * foreground service, the boot receiver and the block activity all talk to this
 * object rather than to each other. It owns session persistence, the block
 * decision, statistics recording and JS event emission; it delegates OS effects
 * (detection loop, notifications, activity launch) to injected collaborators so
 * each stays small and independently testable.
 */
object BlockerController {

  private const val TAG = "FocusBlocker"

  private lateinit var appContext: Context

  // Collaborators are lazy so `initialize` is cheap and re-entrant.
  private val sessionStore by lazy { SessionStore(appContext) }
  private val eventStore by lazy { BlockEventStore(appContext) }
  private val usageAccess by lazy { UsageAccessManager(appContext) }
  private val overlayPermission by lazy { OverlayPermissionManager(appContext) }
  val notifications by lazy { FocusNotificationManager(appContext) }

  @Volatile
  private var session: FocusSession? = null

  private val _status = MutableStateFlow(
    FocusStatus.idle(
      hasUsageAccess = false,
      canDrawOverlays = false,
    ),
  )
  val status: StateFlow<FocusStatus> = _status.asStateFlow()

  /** package -> wall-clock expiry of a temporary "I really need this app" grant. */
  private val temporarilyAllowed = ConcurrentHashMap<String, Long>()

  /** package -> when its block screen was raised, used to measure interruption. */
  private val blockShownAt = ConcurrentHashMap<String, Long>()

  /** Guards against raising more than one block screen at a time. */
  private val blockScreenActive = AtomicBoolean(false)

  /** The package whose launch is currently being blocked, for the block screen. */
  @Volatile
  private var activeBlockPackage: String? = null

  /** Guards against double-completing when timer expiry races the service loop. */
  private val terminating = AtomicBoolean(false)

  /** Idempotent; safe to call from the module, the service and the receiver. */
  fun initialize(context: Context) {
    if (!::appContext.isInitialized) {
      appContext = context.applicationContext
    }
    // Rehydrate a persisted session (e.g. after process death) if we have none.
    if (session == null) {
      sessionStore.load()?.let { restored ->
        if (!restored.isExpired()) {
          session = restored
          publishStatus()
        } else {
          sessionStore.clear()
        }
      }
    }
    publishStatus()
  }

  // region public API used by the Expo module ------------------------------------

  fun hasUsageAccess(): Boolean = usageAccess.hasAccess()

  fun openUsageAccessSettings() = usageAccess.openSettings()

  fun canDrawOverlays(): Boolean = overlayPermission.canDrawOverlays()

  fun openOverlaySettings() = overlayPermission.openSettings()

  fun start(session: FocusSession): FocusStatus {
    terminating.set(false)
    this.session = session
    sessionStore.save(session)
    temporarilyAllowed.clear()
    blockShownAt.clear()
    blockScreenActive.set(false)
    FocusBlockerService.start(appContext)
    return publishStatus()
  }

  fun stop(reason: String = "stopped"): FocusStatus {
    val ended = session
    if (ended != null && terminating.compareAndSet(false, true)) {
      BlockerEventBus.emit(BlockerEvent.SessionEnded(ended.sessionId, reason))
    }
    session = null
    sessionStore.clear()
    temporarilyAllowed.clear()
    blockShownAt.clear()
    activeBlockPackage = null
    blockScreenActive.set(false)
    notifications.clearBlockScreen()
    FocusBlockerService.stop(appContext)
    return publishStatus()
  }

  /**
   * Temporarily suspend blocking without ending the session. The foreground
   * service stays alive but [onTick] skips every block check while paused, and
   * any block screen currently showing is torn down so the user can use the app.
   * Idempotent: pausing an already-paused (or absent) session is a no-op.
   */
  fun pause(): FocusStatus {
    val current = session ?: return publishStatus()
    if (current.paused) return publishStatus()
    val paused = current.copy(paused = true)
    session = paused
    sessionStore.save(paused)
    // Let any in-flight block screen go away immediately.
    activeBlockPackage = null
    blockScreenActive.set(false)
    notifications.clearBlockScreen()
    Log.d(TAG, "[FocusBlocker] session paused")
    return publishStatus()
  }

  /**
   * Resume a paused session, re-arming blocking for the same selected apps
   * without restarting the service. [newEndsAtMs], when > 0, refreshes the
   * wall-clock end so time spent paused is not counted against the session
   * (mirrors the JS timer, which freezes while paused).
   */
  fun resume(newEndsAtMs: Long = 0L): FocusStatus {
    val current = session ?: return publishStatus()
    if (!current.paused) return publishStatus()
    val nextEnd = if (newEndsAtMs > 0L) newEndsAtMs else current.endsAtMs
    val resumed = current.copy(paused = false, endsAtMs = nextEnd)
    session = resumed
    sessionStore.save(resumed)
    // Ensure the service is running so detection resumes (idempotent start:
    // startForegroundService never spawns a second loop).
    FocusBlockerService.start(appContext)
    Log.d(TAG, "[FocusBlocker] session resumed")
    return publishStatus()
  }

  fun emergencyExit(reason: String): FocusStatus {
    val ended = session
    if (ended != null) {
      BlockerEventBus.emit(BlockerEvent.EmergencyExit(ended.sessionId, reason, System.currentTimeMillis()))
    }
    return stop(reason = "emergencyExit")
  }

  fun allowTemporarily(packageName: String, durationMs: Long) {
    temporarilyAllowed[packageName] = System.currentTimeMillis() + durationMs
    // Let the user through immediately: drop the current block screen.
    onBlockScreenDismissed(packageName)
  }

  fun statusMap(): Map<String, Any?> = currentStatus().toMap()

  fun statistics(sessionId: String?): Map<String, Any?> = eventStore.statistics(sessionId)

  fun currentSession(): FocusSession? = session

  // endregion

  // region service / detection ----------------------------------------------------

  /**
   * Called by the foreground service every tick with the resolved foreground
   * package. Handles timer expiry and the block decision. Returns the live
   * session so the service can refresh its notification, or null when idle.
   */
  fun onTick(foregroundPackage: String?): FocusSession? {
    val current = session ?: return null
    // Paused: freeze the timer (do not complete) and skip all blocking checks.
    // The service is allowed to keep running; it just idles.
    if (current.paused) {
      if (
        foregroundPackage != null &&
        foregroundPackage != appContext.packageName &&
        foregroundPackage in current.blockedPackages
      ) {
        Log.d(TAG, "[FocusBlocker] skipping block because session is paused")
      }
      publishStatus()
      return current
    }
    if (current.isExpired()) {
      complete()
      return null
    }
    if (foregroundPackage != null && shouldBlock(current, foregroundPackage)) {
      raiseBlockScreen(current, foregroundPackage)
    }
    publishStatus() // refresh remainingMs for JS subscribers
    return current
  }

  private fun shouldBlock(session: FocusSession, packageName: String): Boolean {
    if (session.paused) return false // defensive: never block while paused
    if (packageName == appContext.packageName) return false // never block BeePlan
    if (packageName !in session.blockedPackages) return false
    if (isTemporarilyAllowed(packageName)) return false
    return !blockScreenActive.get()
  }

  private fun isTemporarilyAllowed(packageName: String): Boolean {
    val expiry = temporarilyAllowed[packageName] ?: return false
    if (System.currentTimeMillis() >= expiry) {
      temporarilyAllowed.remove(packageName)
      return false
    }
    return true
  }

  private fun raiseBlockScreen(session: FocusSession, packageName: String) {
    if (!blockScreenActive.compareAndSet(false, true)) return
    blockShownAt[packageName] = System.currentTimeMillis()
    activeBlockPackage = packageName
    val appName = resolveAppName(packageName)
    BlockerEventBus.emit(
      BlockerEvent.BlockAttempt(session.sessionId, packageName, appName, System.currentTimeMillis()),
    )
    launchBlockScreen(session)
  }

  /**
   * Bring the block screen to the front using the most reliable mechanism the
   * device currently allows:
   *  1. Overlay permission granted → start the Activity directly. Apps that can
   *     draw overlays are exempt from background-activity-launch limits, so this
   *     works on all versions including Android 14+.
   *  2. Otherwise → a full-screen-intent notification. This is best-effort only
   *     (downgraded to a heads-up on Android 14+ for non-calling apps) and is
   *     why the setup UI strongly recommends granting the overlay permission.
   */
  private fun launchBlockScreen(session: FocusSession) {
    if (overlayPermission.canDrawOverlays()) {
      val launched = runCatching {
        appContext.startActivity(BlockActivity.launchIntent(appContext))
      }.isSuccess
      if (launched) return
    }
    notifications.raiseBlockScreen(session)
  }

  /** Invoked by BlockActivity when it goes away (return-to-app, allow, or expiry). */
  fun onBlockScreenDismissed(packageName: String?) {
    val current = session
    val shownAt = packageName?.let { blockShownAt.remove(it) }
    if (current != null && packageName != null && shownAt != null) {
      eventStore.record(
        BlockEvent(
          sessionId = current.sessionId,
          packageName = packageName,
          appName = resolveAppName(packageName),
          timestampMs = shownAt,
          interruptedMs = System.currentTimeMillis() - shownAt,
        ),
      )
    }
    activeBlockPackage = null
    blockScreenActive.set(false)
    notifications.clearBlockScreen()
  }

  /** The app whose block screen is currently showing, or null. */
  fun activeBlockedPackage(): String? = activeBlockPackage

  /** Human-readable label for a package, used by the block screen. */
  fun appLabel(packageName: String): String = resolveAppName(packageName)

  /** Timer reached zero — end cleanly and let Android take back over. */
  fun complete() {
    val ended = session ?: return
    if (terminating.compareAndSet(false, true)) {
      BlockerEventBus.emit(BlockerEvent.SessionEnded(ended.sessionId, "completed"))
    }
    session = null
    sessionStore.clear()
    activeBlockPackage = null
    blockScreenActive.set(false)
    notifications.clearBlockScreen()
    FocusBlockerService.stop(appContext)
    publishStatus()
  }

  // endregion

  private fun resolveAppName(packageName: String): String = runCatching {
    val pm = appContext.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
  }.getOrDefault(packageName)

  private fun currentStatus(): FocusStatus {
    val current = session ?: return FocusStatus.idle(hasUsageAccess(), canDrawOverlays())
    return FocusStatus(
      isActive = true,
      strict = true,
      isPaused = current.paused,
      sessionId = current.sessionId,
      taskTitle = current.taskTitle,
      endsAtMs = current.endsAtMs,
      remainingMs = current.remainingMs(),
      blockedPackages = current.blockedPackages.toList(),
      hasUsageAccess = hasUsageAccess(),
      canDrawOverlays = canDrawOverlays(),
    )
  }

  private fun publishStatus(): FocusStatus {
    val next = currentStatus()
    _status.value = next
    BlockerEventBus.emit(BlockerEvent.StatusChanged(next))
    return next
  }
}
