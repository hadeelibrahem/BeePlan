package com.beeplan.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM tests for the widget's serialization, state selection, remaining-time
 * formatting, and deep-link construction. These exercise the same code paths the
 * device runs, without needing an emulator. (Rendering is verified on-device.)
 */
class BeePlanWidgetDataTest {

  @Test
  fun `parses a recommendation snapshot and its ISO timestamp`() {
    val json = """
      {
        "state": "recommendation",
        "updatedAt": "2026-07-23T12:00:00.000Z",
        "title": "Prepare AI Chapter 3 Summary",
        "taskId": "task-1",
        "estimatedMinutes": 25,
        "priority": "high",
        "dueLabel": "Due tomorrow",
        "whyNow": "High priority and due tomorrow",
        "todayProgressPercent": 40
      }
    """.trimIndent()

    val snapshot = WidgetSnapshot.parse(json)

    assertEquals(WidgetState.RECOMMENDATION, snapshot.state)
    assertEquals("Prepare AI Chapter 3 Summary", snapshot.title)
    assertEquals("task-1", snapshot.taskId)
    assertNull(snapshot.subtaskId)
    assertEquals(25, snapshot.estimatedMinutes)
    assertEquals("high", snapshot.priority)
    assertEquals("Due tomorrow", snapshot.dueLabel)
    assertEquals(40, snapshot.todayProgressPercent)
    assertEquals(1784808000000L, snapshot.updatedAtMs) // 2026-07-23T12:00:00Z
  }

  @Test
  fun `unknown or blank input falls back to the safe empty state`() {
    assertEquals(WidgetState.EMPTY, WidgetSnapshot.parse(null).state)
    assertEquals(WidgetState.EMPTY, WidgetSnapshot.parse("").state)
    assertEquals(WidgetState.EMPTY, WidgetSnapshot.parse("not json").state)
    // Unknown state string also degrades to EMPTY rather than throwing.
    assertEquals(WidgetState.EMPTY, WidgetSnapshot.parse("""{"state":"bogus"}""").state)
  }

  @Test
  fun `parses a focus-active snapshot with an absolute end time`() {
    val json = """
      {
        "state": "focus-active",
        "updatedAt": "2026-07-23T12:00:00.000Z",
        "title": "AI Chapter 3",
        "focusSessionId": "focus-1",
        "focusEndsAt": "2026-07-23T12:18:42.000Z",
        "todayFocusMinutes": 45
      }
    """.trimIndent()

    val snapshot = WidgetSnapshot.parse(json)

    assertEquals(WidgetState.FOCUS_ACTIVE, snapshot.state)
    assertEquals("focus-1", snapshot.focusSessionId)
    assertEquals(45, snapshot.todayFocusMinutes)
    val nowMs = WidgetSnapshot.parseIsoUtc("2026-07-23T12:00:00.000Z")!!
    // 18:42 between now and the end time.
    assertEquals("18:42", WidgetSnapshot.formatRemaining(snapshot.focusEndsAtMs, nowMs))
  }

  @Test
  fun `remaining time formats mm ss, clamps at zero, and grows to h mm ss`() {
    val base = 1_000_000L
    assertEquals("0:00", WidgetSnapshot.formatRemaining(null, base))
    assertEquals("0:00", WidgetSnapshot.formatRemaining(base - 5_000L, base)) // past end → clamped
    assertEquals("0:30", WidgetSnapshot.formatRemaining(base + 30_000L, base))
    assertEquals("25:00", WidgetSnapshot.formatRemaining(base + 25 * 60_000L, base))
    assertEquals("1:05:09", WidgetSnapshot.formatRemaining(base + (65 * 60 + 9) * 1000L, base))
  }

  @Test
  fun `updated-ago label is null when fresh and scales m to h to d`() {
    val now = 10_000_000_000L
    assertNull(WidgetSnapshot.formatUpdatedAgo(null, now))
    assertNull(WidgetSnapshot.formatUpdatedAgo(now - 30_000L, now)) // < 1 min → no label
    assertEquals("5m ago".let { "Updated $it" }, WidgetSnapshot.formatUpdatedAgo(now - 5 * 60_000L, now))
    assertEquals("Updated 2h ago", WidgetSnapshot.formatUpdatedAgo(now - 2 * 60 * 60_000L, now))
    assertEquals("Updated 3d ago", WidgetSnapshot.formatUpdatedAgo(now - 3L * 24 * 60 * 60_000L, now))
  }

  @Test
  fun `builds deep links carrying only the identifiers each action needs`() {
    assertEquals("beeplan://dashboard", BeePlanWidgetActions.buildDeepLink(WidgetAction.OPEN))

    assertEquals(
      "beeplan://focus?action=start&taskId=task-1&subtaskId=sub-9",
      BeePlanWidgetActions.buildDeepLink(WidgetAction.START_FOCUS, taskId = "task-1", subtaskId = "sub-9"),
    )
    // Absent subtask is simply omitted from the query.
    assertEquals(
      "beeplan://focus?action=start&taskId=task-1",
      BeePlanWidgetActions.buildDeepLink(WidgetAction.START_FOCUS, taskId = "task-1"),
    )
    assertEquals(
      "beeplan://focus?action=resume&sessionId=focus-1",
      BeePlanWidgetActions.buildDeepLink(WidgetAction.RESUME_FOCUS, sessionId = "focus-1"),
    )
  }

  @Test
  fun `deepLinkFor selects the action appropriate to each state`() {
    val recommendation = WidgetSnapshot(state = WidgetState.RECOMMENDATION, taskId = "t1", subtaskId = "s1")
    assertEquals(
      "beeplan://focus?action=start&taskId=t1&subtaskId=s1",
      BeePlanWidgetActions.deepLinkFor(recommendation),
    )

    val focus = WidgetSnapshot(state = WidgetState.FOCUS_ACTIVE, focusSessionId = "f1")
    assertEquals("beeplan://focus?action=resume&sessionId=f1", BeePlanWidgetActions.deepLinkFor(focus))

    val next = WidgetSnapshot(state = WidgetState.COMPLETED_NEXT, nextTaskId = "t2")
    assertEquals("beeplan://focus?action=start&taskId=t2", BeePlanWidgetActions.deepLinkFor(next))

    val done = WidgetSnapshot(state = WidgetState.DAY_COMPLETE)
    assertEquals("beeplan://dashboard", BeePlanWidgetActions.deepLinkFor(done))

    val signedOut = WidgetSnapshot(state = WidgetState.SIGNED_OUT)
    assertEquals("beeplan://dashboard", BeePlanWidgetActions.deepLinkFor(signedOut))
  }
}
