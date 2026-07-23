package com.beeplan.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.net.URLEncoder

/**
 * Logical actions the widget can trigger. Each maps to a `beeplan://` deep link
 * that the existing React Navigation `linking` config already routes; the app
 * then decides how to honor it. Crucially, the widget never starts a Focus
 * session itself — "start" links open the Focus start flow with the unit
 * preselected, so existing validation, dependency checks, and setup UI still
 * run.
 */
enum class WidgetAction {
  /** Open BeePlan at the dashboard. */
  OPEN,
  /** Open the Focus start flow with the recommended task/subtask preselected. */
  START_FOCUS,
  /** Open the active Focus session (Resume). */
  RESUME_FOCUS,
  /** Open the Focus start flow with the next recommendation preselected. */
  START_NEXT,
}

object BeePlanWidgetActions {
  const val SCHEME_HOST = "beeplan://"

  /**
   * Build the deep-link URI string for an action. Pure and Android-free so it
   * can be unit-tested; the query only ever carries opaque identifiers, never
   * titles or any user content.
   */
  fun buildDeepLink(
    action: WidgetAction,
    taskId: String? = null,
    subtaskId: String? = null,
    sessionId: String? = null,
  ): String = when (action) {
    WidgetAction.OPEN -> "${SCHEME_HOST}dashboard"
    WidgetAction.RESUME_FOCUS ->
      "${SCHEME_HOST}focus" + query(listOf("action" to "resume", "sessionId" to sessionId))
    WidgetAction.START_FOCUS, WidgetAction.START_NEXT ->
      "${SCHEME_HOST}focus" + query(listOf("action" to "start", "taskId" to taskId, "subtaskId" to subtaskId))
  }

  /** Resolve the correct deep link for a snapshot's primary action. */
  fun deepLinkFor(snapshot: WidgetSnapshot): String = when (snapshot.state) {
    WidgetState.RECOMMENDATION ->
      buildDeepLink(WidgetAction.START_FOCUS, taskId = snapshot.taskId, subtaskId = snapshot.subtaskId)
    WidgetState.FOCUS_ACTIVE ->
      buildDeepLink(WidgetAction.RESUME_FOCUS, sessionId = snapshot.focusSessionId)
    WidgetState.COMPLETED_NEXT ->
      buildDeepLink(WidgetAction.START_NEXT, taskId = snapshot.nextTaskId, subtaskId = snapshot.nextSubtaskId)
    WidgetState.DAY_COMPLETE, WidgetState.SIGNED_OUT, WidgetState.EMPTY ->
      buildDeepLink(WidgetAction.OPEN)
  }

  private fun query(params: List<Pair<String, String?>>): String {
    val present = params.filter { !it.second.isNullOrBlank() }
    if (present.isEmpty()) return ""
    return "?" + present.joinToString("&") { (key, value) ->
      "$key=${URLEncoder.encode(value, "UTF-8")}"
    }
  }

  /**
   * An ACTION_VIEW intent targeting this app for the given deep link. Scoped to
   * `context.packageName` so it always resolves to BeePlan's own activity.
   */
  fun intentFor(context: Context, deepLink: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
