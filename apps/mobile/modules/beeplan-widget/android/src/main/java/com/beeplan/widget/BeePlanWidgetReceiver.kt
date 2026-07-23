package com.beeplan.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * Broadcast receiver that binds [BeePlanWidget] to the Android AppWidget host.
 * Declared in the module manifest so it merges into the app via autolinking.
 */
class BeePlanWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = BeePlanWidget()
}
