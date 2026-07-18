package com.beeplan.focusblocker.ui

import android.graphics.drawable.Drawable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material3.AlertDialog
import kotlinx.coroutines.delay
import java.util.concurrent.TimeUnit

/** Immutable view-model for [BlockScreen]. */
data class BlockScreenModel(
  val appName: String,
  val appIcon: Drawable?,
  val taskTitle: String?,
  val endsAtMs: Long,
  /** Total planned session length (endsAt - startedAt), for the ring progress. */
  val totalMs: Long,
  val motivationalMessage: String,
  val allowEmergencyExit: Boolean,
)

// BeePlan brand accent (matches theme/colors.ts BRAND_YELLOW / BRAND_DARK).
private val BrandYellow = Color(0xFFF9E547)
private val BrandDark = Color(0xFF2B323F)

/** Duration granted when the user confirms "I really need this app". */
private val TEMP_ALLOW_MS = TimeUnit.MINUTES.toMillis(5)

@Composable
fun BlockScreen(
  model: BlockScreenModel,
  onReturnToApp: () -> Unit,
  onReallyNeed: (durationMs: Long) -> Unit,
  onExpired: () -> Unit,
) {
  val dark = isSystemInDarkTheme()
  val colors = if (dark) {
    darkColorScheme(primary = BrandYellow, onPrimary = BrandDark, background = BrandDark)
  } else {
    lightColorScheme(primary = BrandDark, onPrimary = Color.White, background = Color(0xFFF6F7FB))
  }

  MaterialTheme(colorScheme = colors) {
    var remainingMs by remember { mutableLongStateOf((model.endsAtMs - System.currentTimeMillis()).coerceAtLeast(0)) }
    var showConfirm by remember { mutableStateOf(false) }

    // Single ticking clock: recompute from wall time each second, fire onExpired.
    LaunchedEffect(model.endsAtMs) {
      while (true) {
        remainingMs = (model.endsAtMs - System.currentTimeMillis()).coerceAtLeast(0)
        if (remainingMs <= 0) {
          onExpired()
          break
        }
        delay(1000)
      }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = colors.background) {
      Box(
        modifier = Modifier
          .fillMaxSize()
          .background(backgroundGradient(dark))
          .padding(horizontal = 28.dp, vertical = 40.dp),
        contentAlignment = Alignment.Center,
      ) {
        Column(
          modifier = Modifier.fillMaxWidth(),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically),
        ) {
          PulsingBadge(icon = model.appIcon, accent = colors.primary)

          Text(
            text = "Stay Focused",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.ExtraBold,
            color = colors.onBackground,
          )

          Text(
            text = "${model.appName} is blocked during your focus session.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = colors.onBackground.copy(alpha = 0.72f),
          )

          CountdownRing(
            remainingMs = remainingMs,
            totalMs = model.totalMs,
            accent = colors.primary,
            onColor = colors.onBackground,
          )

          model.taskTitle?.takeIf { it.isNotBlank() }?.let { title ->
            Text(
              text = "Focusing on",
              style = MaterialTheme.typography.labelMedium,
              color = colors.onBackground.copy(alpha = 0.5f),
            )
            Text(
              text = title,
              style = MaterialTheme.typography.titleMedium,
              fontWeight = FontWeight.SemiBold,
              textAlign = TextAlign.Center,
              color = colors.onBackground,
            )
          }

          Text(
            text = model.motivationalMessage,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = colors.onBackground.copy(alpha = 0.66f),
            modifier = Modifier.padding(horizontal = 8.dp),
          )

          Spacer(Modifier.height(8.dp))

          Button(
            onClick = onReturnToApp,
            modifier = Modifier
              .fillMaxWidth()
              .height(60.dp), // large touch target
            colors = ButtonDefaults.buttonColors(
              containerColor = colors.primary,
              contentColor = colors.onPrimary,
            ),
          ) {
            Text("Return to BeePlan", fontWeight = FontWeight.Bold, fontSize = 17.sp)
          }

          if (model.allowEmergencyExit) {
            TextButton(onClick = { showConfirm = true }, modifier = Modifier.height(48.dp)) {
              Text(
                "I really need this app",
                color = colors.onBackground.copy(alpha = 0.6f),
              )
            }
          }
        }
      }
    }

    if (showConfirm) {
      AlertDialog(
        onDismissRequest = { showConfirm = false },
        title = { Text("Break focus?") },
        text = {
          Text(
            "This will unblock ${model.appName} for 5 minutes and is recorded in your " +
              "focus stats. Are you sure it can't wait?",
          )
        },
        confirmButton = {
          TextButton(onClick = {
            showConfirm = false
            onReallyNeed(TEMP_ALLOW_MS)
          }) { Text("Unblock 5 min") }
        },
        dismissButton = {
          TextButton(onClick = { showConfirm = false }) { Text("Keep focusing") }
        },
      )
    }
  }
}

@Composable
private fun PulsingBadge(icon: Drawable?, accent: Color) {
  val transition = rememberInfiniteTransition(label = "pulse")
  val scale by transition.animateFloat(
    initialValue = 1f,
    targetValue = 1.08f,
    animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Reverse),
    label = "scale",
  )
  Box(
    modifier = Modifier
      .size(128.dp)
      .scale(scale)
      .clip(CircleShape)
      .background(accent.copy(alpha = 0.16f)),
    contentAlignment = Alignment.Center,
  ) {
    val bitmap = remember(icon) { icon?.toBitmap(96, 96)?.asImageBitmap() }
    if (bitmap != null) {
      Image(bitmap = bitmap, contentDescription = null, modifier = Modifier.size(72.dp))
    } else {
      Text("🐝", fontSize = 48.sp)
    }
  }
}

@Composable
private fun CountdownRing(remainingMs: Long, totalMs: Long, accent: Color, onColor: Color) {
  val fraction = if (totalMs <= 0) 0f else (remainingMs.toFloat() / totalMs.toFloat()).coerceIn(0f, 1f)
  Box(
    modifier = Modifier
      .fillMaxWidth(0.6f)
      .aspectRatio(1f),
    contentAlignment = Alignment.Center,
  ) {
    Canvas(modifier = Modifier.fillMaxSize()) {
      val stroke = Stroke(width = 18f)
      drawArc(
        color = onColor.copy(alpha = 0.12f),
        startAngle = -90f,
        sweepAngle = 360f,
        useCenter = false,
        style = stroke,
      )
      drawArc(
        color = accent,
        startAngle = -90f,
        sweepAngle = 360f * fraction,
        useCenter = false,
        style = stroke,
      )
    }
    Text(
      text = formatClock(remainingMs),
      style = MaterialTheme.typography.displaySmall,
      fontWeight = FontWeight.Bold,
      color = onColor,
    )
  }
}

private fun backgroundGradient(dark: Boolean): Brush = if (dark) {
  Brush.verticalGradient(listOf(Color(0xFF20252F), Color(0xFF2B323F)))
} else {
  Brush.verticalGradient(listOf(Color(0xFFFFFDF2), Color(0xFFF6F7FB)))
}

private fun formatClock(ms: Long): String {
  val totalSeconds = TimeUnit.MILLISECONDS.toSeconds(ms)
  val minutes = totalSeconds / 60
  val seconds = totalSeconds % 60
  return "%d:%02d".format(minutes, seconds)
}
