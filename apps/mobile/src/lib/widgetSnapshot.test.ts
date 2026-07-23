import {
  buildWidgetSnapshot,
  dueLabel,
  normalizePriority,
  type LocalFocusInput,
} from './widgetSnapshot';
import type { TodayDashboard, TodayDashboardFocus, TodayDashboardRecommendation } from './tasksApi';

const NOW = Date.UTC(2026, 6, 23, 12, 0, 0); // 2026-07-23T12:00:00Z
const TZ = 'UTC';

function makeRecommendation(overrides: Partial<TodayDashboardRecommendation> = {}): TodayDashboardRecommendation {
  return {
    taskId: 'task-1',
    taskTitle: 'Prepare AI Chapter 3 Summary',
    subtaskId: null,
    subtaskTitle: null,
    estimatedMinutes: 25,
    reason: 'Due soon',
    recommendationReason: 'High priority and due tomorrow',
    score: 10,
    priority: 'high',
    dueAt: new Date(Date.UTC(2026, 6, 24, 9, 0, 0)).toISOString(),
    ...overrides,
  };
}

function makeActiveFocus(overrides: Partial<TodayDashboardFocus> = {}): TodayDashboardFocus {
  return {
    id: 'focus-1',
    taskId: 'task-1',
    taskTitle: 'AI Chapter 3',
    subtaskId: null,
    subtaskTitle: null,
    startedAt: new Date(NOW - 6 * 60_000).toISOString(), // started 6 min ago
    endedAt: null,
    plannedMinutes: 25,
    actualMinutes: null,
    status: 'active',
    sessionType: 'pomodoro',
    notes: null,
    createdAt: new Date(NOW - 6 * 60_000).toISOString(),
    ...overrides,
  };
}

function makeDashboard(overrides: Partial<TodayDashboard> = {}): TodayDashboard {
  return {
    generatedAt: new Date(NOW).toISOString(),
    timezone: TZ,
    greeting: 'Good afternoon, Sam',
    dailyStatus: { status: 'On track', statusTone: 'positive', summaryLines: [] },
    activeFocus: null,
    recommendation: null,
    whyNow: [],
    timeline: [],
    locationContext: null,
    suggestions: [],
    progress: {
      percent: 40,
      completedWorkUnits: 2,
      totalWorkUnits: 5,
      focusMinutes: 30,
      remainingEstimatedMinutes: 90,
      basis: 'eligible tasks and subtasks due today',
    },
    tomorrowPreview: {
      date: '2026-07-24',
      calendarEvents: [],
      dueWorkUnits: 1,
      estimatedWorkMinutes: 60,
      highPriorityItems: 0,
      capacityMinutes: null,
      overloadStatus: 'unavailable',
    },
    ...overrides,
  };
}

describe('normalizePriority', () => {
  it('collapses urgent onto high and passes the three widget levels', () => {
    expect(normalizePriority('urgent')).toBe('high');
    expect(normalizePriority('high')).toBe('high');
    expect(normalizePriority('medium')).toBe('medium');
    expect(normalizePriority('low')).toBe('low');
    expect(normalizePriority(null)).toBeUndefined();
    expect(normalizePriority('weird')).toBeUndefined();
  });
});

describe('dueLabel', () => {
  it('labels an overdue date, taking precedence over the day match', () => {
    const yesterday = new Date(Date.UTC(2026, 6, 22, 9, 0, 0)).toISOString();
    expect(dueLabel(yesterday, NOW, TZ)).toBe('Overdue');
    // Earlier the same day is still overdue.
    const earlierToday = new Date(Date.UTC(2026, 6, 23, 8, 0, 0)).toISOString();
    expect(dueLabel(earlierToday, NOW, TZ)).toBe('Overdue');
  });

  it('labels today, tonight, tomorrow and a formatted future date', () => {
    const laterToday = new Date(Date.UTC(2026, 6, 23, 15, 0, 0)).toISOString();
    expect(dueLabel(laterToday, NOW, TZ)).toBe('Due today');
    const tonight = new Date(Date.UTC(2026, 6, 23, 21, 0, 0)).toISOString();
    expect(dueLabel(tonight, NOW, TZ)).toBe('Due tonight');
    const tomorrow = new Date(Date.UTC(2026, 6, 24, 9, 0, 0)).toISOString();
    expect(dueLabel(tomorrow, NOW, TZ)).toBe('Due tomorrow');
    const later = new Date(Date.UTC(2026, 6, 30, 9, 0, 0)).toISOString();
    expect(dueLabel(later, NOW, TZ)).toBe('Due Jul 30');
  });

  it('returns undefined for missing or invalid dates', () => {
    expect(dueLabel(null, NOW, TZ)).toBeUndefined();
    expect(dueLabel(undefined, NOW, TZ)).toBeUndefined();
    expect(dueLabel('not-a-date', NOW, TZ)).toBeUndefined();
  });
});

describe('buildWidgetSnapshot', () => {
  // 1. Active Focus overrides recommendation.
  it('lets an active focus session override the recommendation', () => {
    const dashboard = makeDashboard({
      activeFocus: makeActiveFocus(),
      recommendation: makeRecommendation(),
    });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('focus-active');
    expect(snapshot.title).toBe('AI Chapter 3');
    expect(snapshot.focusSessionId).toBe('focus-1');
    expect(snapshot.focusEndsAt).toBe(new Date(NOW + 19 * 60_000).toISOString());
    expect(snapshot.remainingMinutes).toBe(19);
    // Recommendation fields must not leak into the focus state.
    expect(snapshot.dueLabel).toBeUndefined();
  });

  it('prefers the live device focus session over the server active focus', () => {
    const localFocus: LocalFocusInput = {
      sessionId: 'local-99',
      taskId: 'task-9',
      title: 'Local session',
      endsAt: new Date(NOW + 10 * 60_000).toISOString(),
    };
    const dashboard = makeDashboard({ activeFocus: makeActiveFocus() });
    const snapshot = buildWidgetSnapshot({ dashboard, localFocus, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('focus-active');
    expect(snapshot.focusSessionId).toBe('local-99');
    expect(snapshot.remainingMinutes).toBe(10);
  });

  // 2. Recommendation prefers subtask title.
  it('prefers the subtask title when the recommendation targets a subtask', () => {
    const dashboard = makeDashboard({
      recommendation: makeRecommendation({
        subtaskId: 'sub-1',
        subtaskTitle: 'Draft section headers',
      }),
    });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('recommendation');
    expect(snapshot.title).toBe('Draft section headers');
    expect(snapshot.taskId).toBe('task-1');
    expect(snapshot.subtaskId).toBe('sub-1');
  });

  // 3. Recommendation with task only.
  it('uses the task title and carries no subtask id for a task-level recommendation', () => {
    const dashboard = makeDashboard({ recommendation: makeRecommendation() });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('recommendation');
    expect(snapshot.title).toBe('Prepare AI Chapter 3 Summary');
    expect(snapshot.subtaskId).toBeUndefined();
    expect(snapshot.estimatedMinutes).toBe(25);
    expect(snapshot.priority).toBe('high');
    expect(snapshot.dueLabel).toBe('Due tomorrow');
    expect(snapshot.whyNow).toBe('High priority and due tomorrow');
    expect(snapshot.todayProgressPercent).toBe(40);
  });

  // 4. Completed session with next recommendation.
  it('acknowledges completion and surfaces the next recommendation', () => {
    const dashboard = makeDashboard({
      recommendation: makeRecommendation({ taskId: 'task-2', taskTitle: 'Practice AI Questions', estimatedMinutes: 30 }),
    });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, justCompleted: true, now: NOW });
    expect(snapshot.state).toBe('completed-next');
    expect(snapshot.nextTitle).toBe('Practice AI Questions');
    expect(snapshot.nextTaskId).toBe('task-2');
    expect(snapshot.nextEstimatedMinutes).toBe(30);
    // No live task shown as the current title in the completed state.
    expect(snapshot.title).toBeUndefined();
  });

  // 5. Completed day with no next recommendation.
  it('shows day-complete when a completion leaves no further recommendation', () => {
    const dashboard = makeDashboard({
      recommendation: null,
      dailyStatus: { status: 'Day complete', statusTone: 'success', summaryLines: [] },
    });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, justCompleted: true, now: NOW });
    expect(snapshot.state).toBe('day-complete');
    expect(snapshot.nextTitle).toBeUndefined();
  });

  it('shows day-complete for a finished day even without a completion event', () => {
    const dashboard = makeDashboard({
      recommendation: null,
      dailyStatus: { status: 'Day complete', statusTone: 'success', summaryLines: [] },
    });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('day-complete');
  });

  // 6. Signed-out state clears private content.
  it('returns a signed-out snapshot with no private content', () => {
    const dashboard = makeDashboard({ recommendation: makeRecommendation() });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: false, now: NOW });
    expect(snapshot.state).toBe('signed-out');
    expect(snapshot.title).toBeUndefined();
    expect(snapshot.taskId).toBeUndefined();
    expect(snapshot.nextTitle).toBeUndefined();
    expect(snapshot.focusSessionId).toBeUndefined();
    // Only the state + timestamp survive.
    expect(Object.keys(snapshot).sort()).toEqual(['state', 'updatedAt']);
  });

  // 7. Empty dashboard response.
  it('returns the empty state when there is no cached dashboard', () => {
    const snapshot = buildWidgetSnapshot({ dashboard: null, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('empty');
    expect(snapshot.title).toBeUndefined();
  });

  it('returns the empty state when a dashboard has no recommendation and the day is not complete', () => {
    const dashboard = makeDashboard({ recommendation: null, dailyStatus: { status: 'On track', statusTone: 'positive', summaryLines: [] } });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('empty');
    expect(snapshot.todayProgressPercent).toBe(40);
  });

  // 8. Missing optional priority and due date.
  it('omits priority and due label when they are absent', () => {
    const dashboard = makeDashboard({
      recommendation: makeRecommendation({ priority: null, dueAt: null, estimatedMinutes: null }),
    });
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: NOW });
    expect(snapshot.state).toBe('recommendation');
    expect(snapshot.priority).toBeUndefined();
    expect(snapshot.dueLabel).toBeUndefined();
    expect(snapshot.dueAt).toBeUndefined();
    expect(snapshot.estimatedMinutes).toBeUndefined();
    // Title + action still present.
    expect(snapshot.title).toBe('Prepare AI Chapter 3 Summary');
  });

  // 9. Overdue and due-tomorrow labels (via the snapshot, not just the helper).
  it('surfaces overdue and due-tomorrow labels on the recommendation snapshot', () => {
    const overdue = buildWidgetSnapshot({
      dashboard: makeDashboard({
        recommendation: makeRecommendation({ dueAt: new Date(Date.UTC(2026, 6, 22, 9, 0, 0)).toISOString() }),
      }),
      isAuthenticated: true,
      now: NOW,
    });
    expect(overdue.dueLabel).toBe('Overdue');

    const tomorrow = buildWidgetSnapshot({
      dashboard: makeDashboard({ recommendation: makeRecommendation() }),
      isAuthenticated: true,
      now: NOW,
    });
    expect(tomorrow.dueLabel).toBe('Due tomorrow');
  });

  // 10. Stale cached snapshot behavior.
  it('stamps updatedAt from the provided clock and never blanks content when stale', () => {
    const dashboard = makeDashboard({ recommendation: makeRecommendation() });
    const producedAt = Date.UTC(2026, 6, 23, 10, 0, 0); // produced 2h before NOW
    const snapshot = buildWidgetSnapshot({ dashboard, isAuthenticated: true, now: producedAt });
    expect(snapshot.updatedAt).toBe(new Date(producedAt).toISOString());
    // The mapper is age-agnostic: content is preserved regardless of how old
    // the snapshot will look at render time. Staleness is a render-time label,
    // computed from updatedAt, not a reason to drop the recommendation.
    expect(snapshot.state).toBe('recommendation');
    expect(snapshot.title).toBe('Prepare AI Chapter 3 Summary');
    const ageMs = NOW - Date.parse(snapshot.updatedAt);
    expect(ageMs).toBe(2 * 60 * 60 * 1000);
  });
});
