package com.beeplan.focusblocker.core

import android.content.Context
import android.util.Log
import com.beeplan.focusblocker.BuildConfig
import com.beeplan.focusblocker.events.BlockerEvent
import com.beeplan.focusblocker.events.BlockerEventBus
import com.beeplan.focusblocker.notification.FocusNotificationManager
import com.beeplan.focusblocker.permission.OverlayPermissionManager
import com.beeplan.focusblocker.permission.UsageAccessManager
import com.beeplan.focusblocker.service.FocusBlockerService
import com.beeplan.focusblocker.ui.BlockActivity
import com.beeplan.focusblocker.session.FocusSession
import com.beeplan.focusblocker.session.SessionStore
import com.beeplan.focusblocker.session.GuardianRestrictionSource
import com.beeplan.focusblocker.session.GuardianRestrictionStore
import com.beeplan.focusblocker.supervision.SignedGrantStore
import com.beeplan.focusblocker.supervision.SignedTemporaryGrantVerifier
import com.beeplan.focusblocker.stats.BlockEvent
import com.beeplan.focusblocker.stats.BlockEventStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.UUID

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
  private val guardianStore by lazy { GuardianRestrictionStore(appContext) }
  private val signedGrantStore by lazy { SignedGrantStore(appContext) }
  @Volatile private var supervisedUserId: String? = null
  private val eventStore by lazy { BlockEventStore(appContext) }
  private val usageAccess by lazy { UsageAccessManager(appContext) }
  private val overlayPermission by lazy { OverlayPermissionManager(appContext) }
  val notifications by lazy { FocusNotificationManager(appContext) }

  @Volatile
  private var session: FocusSession? = null
  @Volatile private var guardianSources: Map<String, GuardianRestrictionSource> = emptyMap()

  private val _status = MutableStateFlow(
    FocusStatus.idle(
      hasUsageAccess = false,
      canDrawOverlays = false,
    ),
  )
  val status: StateFlow<FocusStatus> = _status.asStateFlow()

  /** package -> wall-clock expiry of a server-authorized temporary access grant. */
  private val temporarilyAllowed = ConcurrentHashMap<String, Long>()

  /** package -> when its block screen was raised, used to measure interruption. */
  private val blockShownAt = ConcurrentHashMap<String, Long>()

  /** Guards against raising more than one block screen at a time. */
  private val blockScreenActive = AtomicBoolean(false)
  data class AppGuardRequestResult(val requestId: String, val state: String, val reason: String? = null, val expiresAt: Long? = null)
  data class PendingAppGuardRequest(
    val requestId: String,
    val packageName: String,
    val justification: String,
    /** Native-owned requests must never be claimed by the JS fallback. */
    val nativeOwned: Boolean,
  )
  private val _appGuardRequestResult = MutableStateFlow<AppGuardRequestResult?>(null)
  val appGuardRequestResult: StateFlow<AppGuardRequestResult?> = _appGuardRequestResult.asStateFlow()
  @Volatile private var pendingAppGuardRequestId: String? = null
  @Volatile private var pendingAppGuardRequest: PendingAppGuardRequest? = null
  private val appGuardRequestGate = AppGuardRequestGate()
  @Volatile private var lastAppGuardDiagnosticPackage: String? = null
  private data class AppGuardRequestClient(val apiBaseUrl: String, val accessToken: String, val userId: String)
  private val appGuardRequestScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  @Volatile private var appGuardRequestClient: AppGuardRequestClient? = null

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
    if (supervisedUserId == null) supervisedUserId = signedGrantStore.userId()
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
    if (guardianSources.isEmpty()) guardianSources = guardianStore.load().filter { it.endsAtMs > System.currentTimeMillis() }.associateBy { it.sourceId }
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
    if (effectiveSession() == null) FocusBlockerService.stop(appContext)
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
    // JS focus-session convenience grants can never override guardian restrictions.
    if (guardianSources.values.any { packageName in it.packages }) return
    temporarilyAllowed[packageName] = System.currentTimeMillis() + durationMs
    // Let the user through immediately: drop the current block screen.
    onBlockScreenDismissed(packageName)
  }
  fun installSignedTemporaryGrant(token: String, userId: String): Boolean { val grant = SignedTemporaryGrantVerifier.verify(token, userId) ?: run { Log.w(TAG, "[AppGuard:Native] signed grant rejected"); return false }; supervisedUserId = userId; signedGrantStore.save(token, userId); temporarilyAllowed[grant.packageName] = grant.expiresAt; Log.i(TAG, "[AppGuard:Native] signed grant accepted package=${grant.packageName}"); onBlockScreenDismissed(grant.packageName); return true }
  fun isAppGuardRestrictionActive(): Boolean = guardianSources.containsKey("app-guard")
  /**
   * Installs the minimum session capability needed by the native BlockActivity.
   * It remains process-memory only and is cleared on logout/session replacement.
   */
  fun configureAppGuardRequestClient(apiBaseUrl: String?, accessToken: String?, userId: String?): Boolean {
    val baseUrl = apiBaseUrl?.trim()?.trimEnd('/')
    appGuardRequestClient = if (!baseUrl.isNullOrBlank() && !accessToken.isNullOrBlank() && !userId.isNullOrBlank() &&
      (baseUrl.startsWith("https://") || baseUrl.startsWith("http://"))) {
      AppGuardRequestClient(baseUrl, accessToken, userId)
    } else null
    if (appGuardRequestClient == null) {
      pendingAppGuardRequestId?.let { requestId ->
        deliverAppGuardResult(requestId, "error", "We couldn't review your request right now. This app remains restricted.", null, null)
      }
    }
    return appGuardRequestClient != null
  }

  /** Native execution avoids relying on a suspended React Native continuation. */
  fun requestBeeJustification(packageName: String, justification: String): String {
    val requestId = appGuardRequestGate.begin { UUID.randomUUID().toString() }
    if (requestId == null) {
      val existingRequestId = appGuardRequestGate.activeId()
      if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] submission ignored reason=already_in_flight requestId=${existingRequestId ?: "unknown"}")
      return existingRequestId ?: ""
    }
    val client = appGuardRequestClient
    val request = PendingAppGuardRequest(requestId, packageName, justification, nativeOwned = client != null)
    pendingAppGuardRequestId = requestId
    pendingAppGuardRequest = request
    _appGuardRequestResult.value = null
    if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] submission accepted requestId=$requestId")
    if (client != null) {
      appGuardRequestScope.launch { submitNativeAppGuardRequest(client, request) }
      return requestId
    }
    if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] emitting justification event requestId=$requestId")
    BlockerEventBus.emit(BlockerEvent.BeeJustificationRequested(requestId, packageName, justification))
    if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] event emission completed requestId=$requestId")
    return requestId
  }

  private fun submitNativeAppGuardRequest(client: AppGuardRequestClient, request: PendingAppGuardRequest) {
    val startedAt = System.currentTimeMillis()
    try {
      if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] native request started requestId=${request.requestId}")
      val connection = (URL("${client.apiBaseUrl}/supervision/app-guard/access-requests").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 42_000
        readTimeout = 42_000
        doOutput = true
        setRequestProperty("Authorization", "Bearer ${client.accessToken}")
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
      }
      val payload = JSONObject().put("packageName", request.packageName).put("justification", request.justification).put("requestId", request.requestId)
      connection.outputStream.use { it.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
      val status = connection.responseCode
      val responseText = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }
      connection.disconnect()
      if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] native request completed requestId=${request.requestId} status=$status durationMs=${System.currentTimeMillis() - startedAt}")
      if (status !in 200..299 || responseText.isNullOrBlank()) {
        deliverNativeAppGuardFailure(request.requestId, AppGuardHttpFailure.message(status, responseText))
        return
      }
      val response = JSONObject(responseText)
      when (response.optString("decision")) {
        "deny" -> deliverNativeAppGuardResult(request.requestId, "deny", response.optString("reason").ifBlank { null }, null, client)
        "allow" -> {
          val grant = response.optString("signedGrant").ifBlank { null }
          if (grant == null) deliverNativeAppGuardFailure(request.requestId)
          else deliverNativeAppGuardResult(request.requestId, "allow", null, grant, client)
        }
        else -> deliverNativeAppGuardFailure(request.requestId)
      }
    } catch (_: Exception) {
      if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] API request failed requestId=${request.requestId} durationMs=${System.currentTimeMillis() - startedAt}")
      deliverNativeAppGuardFailure(request.requestId)
    }
  }

  private fun deliverNativeAppGuardResult(requestId: String, decision: String, reason: String?, signedGrant: String?, client: AppGuardRequestClient) {
    // A logout/session replacement or a newer Ask Bee request can never complete an old request.
    if (appGuardRequestClient !== client || requestId != pendingAppGuardRequestId) return
    deliverAppGuardResult(requestId, decision, reason, signedGrant, client.userId)
  }

  private fun deliverNativeAppGuardFailure(requestId: String, reason: String = "We couldn't review your request right now. This app remains restricted.") {
    if (requestId != pendingAppGuardRequestId) return
    deliverAppGuardResult(requestId, "error", reason, null, null)
  }
  /** Kept only in memory until JS claims a JS-owned fallback request. */
  fun pendingAppGuardRequest(): PendingAppGuardRequest? = pendingAppGuardRequest?.takeUnless { it.nativeOwned }
  fun deliverAppGuardResult(requestId: String, decision: String, reason: String?, signedGrant: String?, userId: String?): Boolean {
    if (requestId != pendingAppGuardRequestId) {
      if (BuildConfig.DEBUG) Log.w(TAG, "[AppGuard:Native] result rejected as stale requestId=$requestId")
      return false
    }
    val result = if (decision == "allow" && signedGrant != null && userId != null && installSignedTemporaryGrant(signedGrant, userId)) {
      val expiry = SignedTemporaryGrantVerifier.verify(signedGrant, userId)?.expiresAt
      AppGuardRequestResult(requestId, "approved", expiresAt = expiry)
    } else if (decision == "deny") AppGuardRequestResult(requestId, "denied", reason)
    else AppGuardRequestResult(requestId, "error", reason ?: "We couldn't review your request right now. This app remains restricted.")
    _appGuardRequestResult.value = result; pendingAppGuardRequestId = null; pendingAppGuardRequest = null; appGuardRequestGate.finish(requestId)
    if (BuildConfig.DEBUG) Log.i(TAG, "[AppGuard:Native] request terminal state requestId=$requestId state=${if (result.state == "approved") "allow" else if (result.state == "denied") "deny" else "error"}")
    return result.state != "error" || decision != "allow"
  }
  fun expireAppGuardRequest(requestId: String) { if (requestId == pendingAppGuardRequestId) deliverAppGuardResult(requestId, "error", "We couldn't review your request right now. This app remains restricted.", null, null) }

  fun statusMap(): Map<String, Any?> = currentStatus().toMap()

  fun statistics(sessionId: String?): Map<String, Any?> = eventStore.statistics(sessionId)

  fun setGuardianSources(sources: List<GuardianRestrictionSource>): Map<String, Any> {
    guardianSources = sources.filter { it.endsAtMs > System.currentTimeMillis() }.associateBy { it.sourceId }
    guardianStore.save(guardianSources.values)
    if (effectiveSession() == null) FocusBlockerService.stop(appContext) else FocusBlockerService.start(appContext)
    publishStatus()
    return mapOf("sources" to guardianSources.keys.toList(), "blockedPackages" to guardianSources.values.flatMap { it.packages }.distinct())
  }
  fun setAppGuardSources(sources: List<GuardianRestrictionSource>): Map<String, Any> {
    // App Guard owns only its source. Keep other long-lived sources intact;
    // focus/strict-mode is independently unioned by effectiveSession().
    val next = guardianSources.filterKeys { it != "app-guard" }.toMutableMap()
    sources.filter { it.sourceId == "app-guard" && it.endsAtMs > System.currentTimeMillis() }.forEach { next[it.sourceId] = it }
    guardianSources = next
    lastAppGuardDiagnosticPackage = null
    guardianStore.save(guardianSources.values)
    if (effectiveSession() == null) FocusBlockerService.stop(appContext) else FocusBlockerService.start(appContext)
    publishStatus()
    val result = mapOf("sources" to guardianSources.keys.toList(), "blockedPackages" to guardianSources.values.flatMap { it.packages }.distinct())
    Log.i(TAG, "[AppGuard:Native] restrictions updated enabled=${sources.isNotEmpty()} count=${sources.flatMap { it.packages }.distinct().size} packages=${sources.flatMap { it.packages }.distinct()}")
    return result
  }
  fun currentSession(): FocusSession? = effectiveSession()

  // endregion

  // region service / detection ----------------------------------------------------

  /**
   * Called by the foreground service every tick with the resolved foreground
   * package. Handles timer expiry and the block decision. Returns the live
   * session so the service can refresh its notification, or null when idle.
   */
  fun onTick(foregroundPackage: String?): FocusSession? {
    pruneExpiredGuardianSources()
    val self = session
    if (self != null && self.isExpired()) complete()
    val current = effectiveSession() ?: return null
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
    if (foregroundPackage != null && foregroundPackage != appContext.packageName) {
      val appGuardPackages = guardianSources["app-guard"]?.packages.orEmpty()
      if (foregroundPackage in appGuardPackages && foregroundPackage != lastAppGuardDiagnosticPackage) {
        lastAppGuardDiagnosticPackage = foregroundPackage
        val activeGrant = isTemporarilyAllowed(foregroundPackage)
        val decision = if (activeGrant) "allow reason=active_grant" else if (blockScreenActive.get()) "allow reason=block_screen_active" else "block"
        Log.i(TAG, "[AppGuard:Native] checking package=$foregroundPackage appGuardEnabled=${guardianSources.containsKey("app-guard")} restricted=true activeGrant=$activeGrant decision=$decision")
        if (activeGrant) publishStatus()
      }
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
    val stored = signedGrantStore.load(); val user = supervisedUserId
    if (stored != null && user != null) { val grant = SignedTemporaryGrantVerifier.verify(stored, user); if (grant != null && grant.packageName == packageName) return true; signedGrantStore.clear() }
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
      if (launched) { Log.i(TAG, "[AppGuard:Native] block screen launched via overlay"); return }
    }
    Log.w(TAG, "[AppGuard:Native] block screen using notification fallback overlayPermission=false")
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
    if (effectiveSession() == null) FocusBlockerService.stop(appContext)
    publishStatus()
  }

  // endregion

  private fun resolveAppName(packageName: String): String = runCatching {
    val pm = appContext.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
  }.getOrDefault(packageName)

  private fun currentStatus(): FocusStatus {
    val current = effectiveSession() ?: return FocusStatus.idle(hasUsageAccess(), canDrawOverlays())
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

  private fun pruneExpiredGuardianSources() {
    val active = guardianSources.values.filter { it.endsAtMs > System.currentTimeMillis() }.associateBy { it.sourceId }
    if (active.size != guardianSources.size) { guardianSources = active; guardianStore.save(active.values) }
  }
  private fun effectiveSession(): FocusSession? {
    val all = guardianSources.values
    val self = session
    if (self == null && all.isEmpty()) return null
    val packages = (self?.blockedPackages ?: emptySet()) + all.flatMap { it.packages }
    val ends = listOfNotNull(self?.endsAtMs).plus(all.map { it.endsAtMs }).maxOrNull() ?: return null
    return FocusSession("effective-restrictions", self?.taskTitle, ends, packages, "", false, self?.startedAtMs ?: System.currentTimeMillis(), self?.paused == true && all.isEmpty())
  }
}
