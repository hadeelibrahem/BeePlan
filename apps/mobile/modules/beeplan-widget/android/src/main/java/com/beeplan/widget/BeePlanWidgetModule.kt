package com.beeplan.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class BeePlanWidgetModule : Module() {

  private val scope =
    CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BeePlanWidget")

    AsyncFunction("setSnapshot") { snapshotJson: String ->
      val ctx: Context = context

      WidgetStore.save(ctx, snapshotJson)

      scope.launch {
        try {
          BeePlanWidget().updateAll(ctx)
        } catch (_: Exception) {
          // Snapshot remains saved even if repaint fails.
        }
      }
    }

    AsyncFunction("clearSnapshot") {
      val ctx: Context = context

      WidgetStore.clear(ctx)

      scope.launch {
        try {
          BeePlanWidget().updateAll(ctx)
        } catch (_: Exception) {
          // Private snapshot is still cleared.
        }
      }
    }

    OnDestroy {
      scope.cancel()
    }
  }
}