package com.beeplan.widget

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

// BeePlan brand palette (from BeePlanLogo.tsx). The lockup — yellow bee, white
// "Bee" + yellow "Plan" — is designed for a dark surface, so the widget uses a
// premium dark slate card with the brand yellow as its accent.
private object WidgetTheme {
  val background = ColorProvider(Color(0xFF2B323F)) // brand dark slate
  val textPrimary = ColorProvider(Color(0xFFFFFFFF))
  val textSecondary = ColorProvider(Color(0xFFA1A7B3)) // brand muted
  val accent = ColorProvider(Color(0xFFFDEF4B)) // brand yellow
  val accentText = ColorProvider(Color(0xFF2B323F)) // dark text on yellow button
  val wordmark = ColorProvider(Color(0xFFFFFFFF)) // "Bee"
  val wordmarkAccent = ColorProvider(Color(0xFFFDEF4B)) // "Plan"
  val danger = ColorProvider(Color(0xFFF87171)) // overdue (readable on dark)
  val success = ColorProvider(Color(0xFF4ADE80)) // celebrate (readable on dark)
}

private val COMPACT_MAX_HEIGHT = 128.dp

@Composable
fun BeePlanWidgetContent(snapshot: WidgetSnapshot, nowMs: Long) {
  val size = LocalSize.current
  val compact = size.height < COMPACT_MAX_HEIGHT
  // Show the mascot only when there is horizontal room for it beside the title.
  val showBee = size.width >= 200.dp

  Box(
    modifier = GlanceModifier
      .fillMaxSize()
      .appWidgetBackground()
      .background(WidgetTheme.background)
      .cornerRadius(20.dp)
      .padding(16.dp),
  ) {
    when (snapshot.state) {
      WidgetState.FOCUS_ACTIVE ->
        FocusActive(snapshot, compact, showBee, nowMs)

      WidgetState.RECOMMENDATION ->
        Recommendation(snapshot, compact, showBee, nowMs)

      WidgetState.COMPLETED_NEXT ->
        CompletedNext(snapshot, compact, showBee)

      WidgetState.DAY_COMPLETE ->
        Simple(
          heading = "You're done for today",
          body = "All planned work is complete.",
          action = "Open BeePlan",
          snapshot = snapshot,
          compact = compact,
          showBee = showBee,
        )

      WidgetState.SIGNED_OUT ->
        Simple(
          heading = null,
          body = "Sign in to see what to do next.",
          action = "Open BeePlan",
          snapshot = snapshot,
          compact = compact,
          showBee = showBee,
        )

      WidgetState.EMPTY ->
        Simple(
          heading = null,
          body = "Open BeePlan to prepare your day.",
          action = "Open BeePlan",
          snapshot = snapshot,
          compact = compact,
          showBee = showBee,
        )
    }
  }
}

@Composable
private fun Recommendation(
  snapshot: WidgetSnapshot,
  compact: Boolean,
  showBee: Boolean,
  nowMs: Long,
) {
  val title = snapshot.title ?: "Focus recommendation"

  Column(modifier = GlanceModifier.fillMaxSize()) {
    Header(snapshot, compact, showBee)

    Heading("DO THIS NOW", WidgetTheme.accent)

    Spacer(GlanceModifier.height(6.dp))

    Text(
      text = title,
      maxLines = 2,
      style = TextStyle(
        color = WidgetTheme.textPrimary,
        fontWeight = FontWeight.Bold,
        fontSize = if (compact) 16.sp else 19.sp,
      ),
    )

    val meta = metadataLine(snapshot)

    if (meta != null) {
      Spacer(GlanceModifier.height(6.dp))

      Text(
        text = meta,
        maxLines = 1,
        style = TextStyle(
          color = WidgetTheme.textSecondary,
          fontSize = 13.sp,
        ),
      )
    }

    snapshot.dueLabel?.let { due ->
      Spacer(GlanceModifier.height(2.dp))

      val tone =
        if (due == "Overdue") {
          WidgetTheme.danger
        } else {
          WidgetTheme.textSecondary
        }

      Text(
        text = due,
        maxLines = 1,
        style = TextStyle(
          color = tone,
          fontSize = 13.sp,
          fontWeight = FontWeight.Medium,
        ),
      )
    }

    if (!compact) {
      snapshot.whyNow?.let { why ->
        Spacer(GlanceModifier.height(6.dp))

        Text(
          text = why,
          maxLines = 2,
          style = TextStyle(
            color = WidgetTheme.textSecondary,
            fontSize = 12.sp,
          ),
        )
      }
    }

    Spacer(GlanceModifier.defaultWeight())

    Footer(snapshot, nowMs, compact)

    PrimaryAction(
      label = "Start Focus",
      description = "Start Focus on $title",
      snapshot = snapshot,
    )
  }
}

@Composable
private fun FocusActive(
  snapshot: WidgetSnapshot,
  compact: Boolean,
  showBee: Boolean,
  nowMs: Long,
) {
  val title = snapshot.title ?: "Focus session"

  Column(modifier = GlanceModifier.fillMaxSize()) {
    Header(snapshot, compact, showBee)

    Heading("FOCUS IN PROGRESS", WidgetTheme.accent)

    Spacer(GlanceModifier.height(8.dp))

    Text(
      text = title,
      maxLines = 2,
      style = TextStyle(
        color = WidgetTheme.textPrimary,
        fontWeight = FontWeight.Bold,
        fontSize = if (compact) 16.sp else 19.sp,
      ),
    )

    Spacer(GlanceModifier.height(6.dp))

    Text(
      text = "${WidgetSnapshot.formatRemaining(snapshot.focusEndsAtMs, nowMs)} remaining",
      maxLines = 1,
      style = TextStyle(
        color = WidgetTheme.textPrimary,
        fontWeight = FontWeight.Bold,
        fontSize = if (compact) 20.sp else 26.sp,
      ),
    )

    Spacer(GlanceModifier.defaultWeight())

    // Focus-specific footer: minutes focused today (falls back to nothing when
    // the dashboard didn't provide it). Not shown when space is tight.
    if (!compact) {
      snapshot.todayFocusMinutes?.let { minutes ->
        Text(
          text = "Focused today: $minutes min",
          maxLines = 1,
          style = TextStyle(color = WidgetTheme.textSecondary, fontSize = 11.sp),
        )
        Spacer(GlanceModifier.height(8.dp))
      }
    }

    PrimaryAction(
      label = "Resume",
      description = "Resume $title",
      snapshot = snapshot,
    )
  }
}

@Composable
private fun CompletedNext(
  snapshot: WidgetSnapshot,
  compact: Boolean,
  showBee: Boolean,
) {
  val next = snapshot.nextTitle ?: "your next task"

  Column(modifier = GlanceModifier.fillMaxSize()) {
    Header(snapshot, compact, showBee)

    Heading("Great job!", WidgetTheme.success)

    Spacer(GlanceModifier.height(8.dp))

    Text(
      text = "Next task:",
      maxLines = 1,
      style = TextStyle(
        color = WidgetTheme.textSecondary,
        fontSize = 12.sp,
      ),
    )

    Spacer(GlanceModifier.height(2.dp))

    Text(
      text = next,
      maxLines = 2,
      style = TextStyle(
        color = WidgetTheme.textPrimary,
        fontWeight = FontWeight.Bold,
        fontSize = if (compact) 16.sp else 19.sp,
      ),
    )

    snapshot.nextEstimatedMinutes?.let { minutes ->
      Spacer(GlanceModifier.height(6.dp))

      Text(
        text = "Estimated: $minutes min",
        maxLines = 1,
        style = TextStyle(
          color = WidgetTheme.textSecondary,
          fontSize = 13.sp,
        ),
      )
    }

    Spacer(GlanceModifier.defaultWeight())

    PrimaryAction(
      label = "Start Next",
      description = "Start next task $next",
      snapshot = snapshot,
    )
  }
}

@Composable
private fun Simple(
  heading: String?,
  body: String,
  action: String,
  snapshot: WidgetSnapshot,
  compact: Boolean,
  showBee: Boolean,
) {
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Header(snapshot, compact, showBee)

    heading?.let {
      Text(
        text = it,
        maxLines = 2,
        style = TextStyle(
          color = WidgetTheme.textPrimary,
          fontWeight = FontWeight.Bold,
          fontSize = if (compact) 16.sp else 19.sp,
        ),
      )

      Spacer(GlanceModifier.height(6.dp))
    }

    Text(
      text = body,
      maxLines = 3,
      style = TextStyle(
        color = WidgetTheme.textSecondary,
        fontSize = 14.sp,
      ),
    )

    Spacer(GlanceModifier.defaultWeight())

    PrimaryAction(
      label = action,
      description = action,
      snapshot = snapshot,
    )
  }
}

/**
 * Branded header: BeePlan logo + wordmark on the left, the state-specific bee
 * mascot on the right. The whole header is a lightweight click target — it opens
 * the active session when focusing, otherwise the dashboard — using the existing
 * deep-link builders (no new navigation, no silent Focus start).
 */
@Composable
private fun Header(
  snapshot: WidgetSnapshot,
  compact: Boolean,
  showBee: Boolean,
) {
  val context = LocalContext.current
  val intent = BeePlanWidgetActions.intentFor(context, headerDeepLinkFor(snapshot))

  Row(
    modifier = GlanceModifier
      .fillMaxWidth()
      .clickable(actionStartActivity(intent)),
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    Image(
      provider = ImageProvider(R.drawable.beeplan_logo),
      contentDescription = "BeePlan",
      modifier = GlanceModifier.size(if (compact) 22.dp else 28.dp),
    )

    Spacer(GlanceModifier.width(7.dp))

    // Two-tone wordmark: "Bee" (white) + "Plan" (brand yellow), matching the app.
    Text(
      text = "Bee",
      maxLines = 1,
      style = TextStyle(color = WidgetTheme.wordmark, fontWeight = FontWeight.Bold, fontSize = 15.sp),
    )
    Text(
      text = "Plan",
      maxLines = 1,
      style = TextStyle(color = WidgetTheme.wordmarkAccent, fontWeight = FontWeight.Bold, fontSize = 15.sp),
    )

    Spacer(GlanceModifier.defaultWeight())

    if (showBee) {
      Image(
        provider = ImageProvider(beeDrawableFor(snapshot.state)),
        contentDescription = beeDescriptionFor(snapshot.state),
        modifier = GlanceModifier.size(if (compact) 32.dp else 44.dp),
      )
    }
  }

  Spacer(GlanceModifier.height(if (compact) 6.dp else 10.dp))
}

/** State → mascot pose. The bee changes whenever the snapshot state changes. */
private fun beeDrawableFor(state: WidgetState): Int = when (state) {
  WidgetState.FOCUS_ACTIVE -> R.drawable.bee_focusing
  WidgetState.COMPLETED_NEXT, WidgetState.DAY_COMPLETE -> R.drawable.bee_celebrating
  WidgetState.SIGNED_OUT, WidgetState.EMPTY -> R.drawable.bee_sleeping
  WidgetState.RECOMMENDATION -> R.drawable.bee_idle
}

private fun beeDescriptionFor(state: WidgetState): String = when (state) {
  WidgetState.FOCUS_ACTIVE -> "Bee focusing"
  WidgetState.COMPLETED_NEXT, WidgetState.DAY_COMPLETE -> "Bee celebrating"
  WidgetState.SIGNED_OUT, WidgetState.EMPTY -> "Bee resting"
  WidgetState.RECOMMENDATION -> "Bee ready"
}

/** Header tap target: resume the live session when focusing, else open the app. */
private fun headerDeepLinkFor(snapshot: WidgetSnapshot): String =
  if (snapshot.state == WidgetState.FOCUS_ACTIVE) {
    BeePlanWidgetActions.buildDeepLink(WidgetAction.RESUME_FOCUS, sessionId = snapshot.focusSessionId)
  } else {
    BeePlanWidgetActions.buildDeepLink(WidgetAction.OPEN)
  }

@Composable
private fun Heading(
  text: String,
  color: ColorProvider,
) {
  Text(
    text = text,
    maxLines = 1,
    style = TextStyle(
      color = color,
      fontWeight = FontWeight.Bold,
      fontSize = 11.sp,
    ),
  )
}

@Composable
private fun Footer(
  snapshot: WidgetSnapshot,
  nowMs: Long,
  compact: Boolean,
) {
  if (compact) {
    return
  }

  val parts = mutableListOf<String>()

  snapshot.todayProgressPercent?.let {
    parts.add("$it% today")
  }

  WidgetSnapshot.formatUpdatedAgo(snapshot.updatedAtMs, nowMs)?.let {
    parts.add(it)
  }

  if (parts.isEmpty()) {
    return
  }

  Text(
    text = parts.joinToString("  •  "),
    maxLines = 1,
    style = TextStyle(
      color = WidgetTheme.textSecondary,
      fontSize = 11.sp,
    ),
  )

  Spacer(GlanceModifier.height(8.dp))
}

@Composable
private fun PrimaryAction(
  label: String,
  description: String,
  snapshot: WidgetSnapshot,
) {
  val context = LocalContext.current

  val intent = BeePlanWidgetActions.intentFor(
    context,
    BeePlanWidgetActions.deepLinkFor(snapshot),
  )

  Box(
    modifier = GlanceModifier
      .fillMaxWidth()
      .height(44.dp)
      .background(WidgetTheme.accent)
      .cornerRadius(12.dp)
      .clickable(actionStartActivity(intent))
      .semantics {
        contentDescription = description
      },
    contentAlignment = Alignment.Center,
  ) {
    Text(
      text = label,
      maxLines = 1,
      style = TextStyle(
        color = WidgetTheme.accentText,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        textAlign = TextAlign.Center,
      ),
    )
  }
}

private fun metadataLine(snapshot: WidgetSnapshot): String? {
  val parts = mutableListOf<String>()

  snapshot.estimatedMinutes?.let {
    if (it > 0) {
      parts.add("$it min")
    }
  }

  priorityLabel(snapshot.priority)?.let {
    parts.add(it)
  }

  return if (parts.isEmpty()) {
    null
  } else {
    parts.joinToString(" • ")
  }
}

private fun priorityLabel(priority: String?): String? =
  when (priority) {
    "high" -> "High Priority"
    "medium" -> "Medium Priority"
    "low" -> "Low Priority"
    else -> null
  }