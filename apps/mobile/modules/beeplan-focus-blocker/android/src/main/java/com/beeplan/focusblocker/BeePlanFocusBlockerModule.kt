package com.beeplan.focusblocker

import android.content.Context
import com.beeplan.focusblocker.apps.InstalledAppsProvider
import com.beeplan.focusblocker.core.BlockerController
import com.beeplan.focusblocker.events.BlockerEvent
import com.beeplan.focusblocker.events.BlockerEventBus
import com.beeplan.focusblocker.session.FocusSession
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** JS-facing config for `startStrictMode`, mirrors StartStrictModeConfig.ts. */
class StartStrictModeConfig : Record {
  @Field var sessionId: String = ""
  @Field var taskTitle: String? = null
  @Field var startedAtMs: Double = 0.0
  @Field var endsAtMs: Double = 0.0
  @Field var blockedPackages: List<String> = emptyList()
  @Field var motivationalMessage: String = ""
  @Field var allowEmergencyExit: Boolean = true
}

/**
 * Expo module surface for BeePlanFocusBlocker.
 *
 * Intentionally thin: it validates/marshals arguments and forwards to
 * [BlockerController], and it owns the single JS-facing collector of
 * [BlockerEventBus] so no other native component needs a module reference.
 */
class BeePlanFocusBlockerModule : Module() {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BeePlanFocusBlocker")

    Events("onStatusChange", "onBlockAttempt", "onSessionEnded", "onEmergencyExit")

    OnCreate {
      BlockerController.initialize(context)
      // Bridge native core events → JS. One collector for the whole module.
      scope.launch {
        BlockerEventBus.events.collect { event -> dispatch(event) }
      }
    }

    OnDestroy {
      scope.cancel()
    }

    Function("hasUsageAccess") {
      BlockerController.hasUsageAccess()
    }

    Function("openUsageAccessSettings") {
      BlockerController.openUsageAccessSettings()
    }

    Function("hasOverlayPermission") {
      BlockerController.canDrawOverlays()
    }

    Function("openOverlaySettings") {
      BlockerController.openOverlaySettings()
    }

    Function("getStatus") {
      BlockerController.statusMap()
    }

    AsyncFunction("getInstalledApps") {
      InstalledAppsProvider(context).launchableApps().map { it.toMap() }
    }

    AsyncFunction("startStrictMode") { config: StartStrictModeConfig ->
      require(config.sessionId.isNotBlank()) { "sessionId is required" }
      require(config.endsAtMs > System.currentTimeMillis()) { "endsAtMs must be in the future" }
      val session = FocusSession(
        sessionId = config.sessionId,
        taskTitle = config.taskTitle?.takeIf { it.isNotBlank() },
        endsAtMs = config.endsAtMs.toLong(),
        blockedPackages = config.blockedPackages.toSet(),
        motivationalMessage = config.motivationalMessage,
        allowEmergencyExit = config.allowEmergencyExit,
        // Prefer the caller's real session start (accurate ring after restore);
        // fall back to now when the caller does not provide one.
        startedAtMs = config.startedAtMs.toLong().takeIf { it > 0L } ?: System.currentTimeMillis(),
      )
      BlockerController.start(session).toMap()
    }

    AsyncFunction("stopStrictMode") {
      BlockerController.stop().toMap()
    }

    AsyncFunction("emergencyExit") { reason: String ->
      BlockerController.emergencyExit(reason).toMap()
    }

    AsyncFunction("allowAppTemporarily") { packageName: String, durationMs: Double ->
      BlockerController.allowTemporarily(packageName, durationMs.toLong())
    }

    AsyncFunction("getStatistics") { sessionId: String? ->
      BlockerController.statistics(sessionId)
    }
  }

  private fun dispatch(event: BlockerEvent) = when (event) {
    is BlockerEvent.StatusChanged ->
      sendEvent("onStatusChange", event.status.toMap())

    is BlockerEvent.BlockAttempt ->
      sendEvent(
        "onBlockAttempt",
        mapOf(
          "sessionId" to event.sessionId,
          "packageName" to event.packageName,
          "appName" to event.appName,
          "timestampMs" to event.timestampMs.toDouble(),
        ),
      )

    is BlockerEvent.SessionEnded ->
      sendEvent(
        "onSessionEnded",
        mapOf("sessionId" to event.sessionId, "reason" to event.reason),
      )

    is BlockerEvent.EmergencyExit ->
      sendEvent(
        "onEmergencyExit",
        mapOf(
          "sessionId" to event.sessionId,
          "reason" to event.reason,
          "timestampMs" to event.timestampMs.toDouble(),
        ),
      )
  }
}
