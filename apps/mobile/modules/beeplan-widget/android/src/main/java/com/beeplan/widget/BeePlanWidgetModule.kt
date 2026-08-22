package com.beeplan.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import expo.modules.kotlin.Promise
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

    AsyncFunction("setSnapshot") { snapshotJson: String, promise: Promise ->
      val ctx: Context = context

      scope.launch {
        try {
          WidgetStore.save(ctx, snapshotJson)
          BeePlanWidget().updateAll(ctx)
          promise.resolve(null)
        } catch (exception: Exception) {
          promise.reject("ERR_BEEPLAN_WIDGET_SNAPSHOT", exception.message, exception)
        }
      }

      Unit
    }

    AsyncFunction("clearSnapshot") { promise: Promise ->
      val ctx: Context = context

      scope.launch {
        try {
          WidgetStore.clear(ctx)
          BeePlanWidget().updateAll(ctx)
          promise.resolve(null)
        } catch (exception: Exception) {
          promise.reject("ERR_BEEPLAN_WIDGET_SNAPSHOT", exception.message, exception)
        }
      }

      Unit
    }

    OnDestroy {
      scope.cancel()
    }
  }
}
