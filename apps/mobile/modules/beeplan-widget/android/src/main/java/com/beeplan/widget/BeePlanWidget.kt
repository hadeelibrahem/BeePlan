package com.beeplan.widget

import android.content.Context
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent

/**
 * The Glance-backed "What should I do now?" widget.
 *
 * Reads the last snapshot the mobile app pushed (persisted in [WidgetStore], so
 * it renders correctly after the app is killed or the phone reboots) and hands
 * it to the responsive renderer. It never fetches or selects tasks itself — all
 * recommendation logic stays in the API/mobile layer.
 */
class BeePlanWidget : GlanceAppWidget() {

  // Distinct layouts for phone-sized small / medium / large placements. The
  // renderer further adapts using LocalSize, but declaring the breakpoints lets
  // Glance hand us the closest bucket so resizing never breaks the layout.
  override val sizeMode = SizeMode.Responsive(
    setOf(
      DpSize(160.dp, 100.dp), // small — reduced layout
      DpSize(250.dp, 140.dp), // medium — primary supported size
      DpSize(320.dp, 220.dp), // large — extra room
    ),
  )

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val snapshot = WidgetStore.load(context)
    // Captured once per update; the countdown is an approximate status by
    // design (see refresh notes) — the in-app Focus timer stays authoritative.
    val now = System.currentTimeMillis()
    provideContent {
      BeePlanWidgetContent(snapshot, now)
    }
  }
}
