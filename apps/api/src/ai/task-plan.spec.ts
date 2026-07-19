import { normalizeTaskPlanChatResponse } from './task-plan';

// Pins the server-side guarantees the prompt relies on: whatever the model
// returns, the response the client sees matches the TaskPlanChatResponse
// contract, and impossible schedule items (past sessions/reminders, inverted
// ranges) never survive normalization.

const now = new Date('2026-07-18T12:00:00.000Z');

const fullPlan = {
  type: 'plan',
  message: 'Here is your study plan.',
  state: 'save_ready',
  understoodSummary: {
    goal: 'Pass the calculus final',
    goalType: 'study',
    deadline: '2026-07-25',
    availableTime: '2h per day',
    currentProgress: 'chapters 1-3 done',
    deliverables: ['exam readiness'],
    constraints: ['work in the mornings'],
    risks: ['too little practice time — add a mock exam midweek'],
  },
  plan: {
    mainTask: {
      title: 'Prepare for calculus final',
      description: 'Cover chapters 4-7 and take two mock exams.',
      dueDate: '2026-07-25T08:00:00.000Z',
      priority: 'high',
    },
    subtasks: [
      {
        title: 'Review chapter 4',
        description: 'Deliverable: solved end-of-chapter problems.',
        estimatedMinutes: 90,
      },
      {
        title: 'Mock exam',
        description: 'Deliverable: graded mock exam.',
        estimatedMinutes: 120,
      },
    ],
    focusSessions: [
      {
        title: 'Chapter 4 session',
        startTime: '2026-07-19T09:00:00.000Z',
        endTime: '2026-07-19T10:30:00.000Z',
        relatedSubtaskTitle: 'Review chapter 4',
      },
      {
        title: 'Mock exam session',
        startTime: '2026-07-21T09:00:00.000Z',
        endTime: '2026-07-21T11:00:00.000Z',
        relatedSubtaskTitle: 'Mock exam',
      },
    ],
    reminders: [
      { title: 'Start studying', remindAt: '2026-07-19T08:30:00.000Z', type: 'time' },
    ],
  },
};

describe('normalizeTaskPlanChatResponse', () => {
  it('normalizes a full plan into the exact response contract', () => {
    const result = normalizeTaskPlanChatResponse(fullPlan, now);

    expect(result.type).toBe('plan');
    expect(result.state).toBe('save_ready');
    expect(result.message).toBe('Here is your study plan.');
    expect(result.understoodSummary?.goal).toBe('Pass the calculus final');
    expect(result.understoodSummary?.risks).toEqual([
      'too little practice time — add a mock exam midweek',
    ]);

    const plan = result.plan!;
    expect(plan.mainTask).toEqual({
      title: 'Prepare for calculus final',
      description: 'Cover chapters 4-7 and take two mock exams.',
      dueDate: '2026-07-25T08:00:00.000Z',
      priority: 'high',
    });
    // Order is reassigned sequentially — the dependency-safe execution order.
    expect(plan.subtasks.map((s) => s.order)).toEqual([1, 2]);
    expect(plan.subtasks[0]).toMatchObject({
      title: 'Review chapter 4',
      estimatedMinutes: 90,
    });
    expect(plan.focusSessions).toHaveLength(2);
    expect(plan.focusSessions[0].relatedSubtaskTitle).toBe('Review chapter 4');
    expect(plan.reminders).toEqual([
      { title: 'Start studying', remindAt: '2026-07-19T08:30:00.000Z', type: 'time' },
    ]);
  });

  it('drops focus sessions that start in the past', () => {
    const raw = structuredClone(fullPlan);
    raw.plan.focusSessions[0].startTime = '2026-07-17T09:00:00.000Z';
    raw.plan.focusSessions[0].endTime = '2026-07-17T10:00:00.000Z';

    const result = normalizeTaskPlanChatResponse(raw, now);
    expect(result.plan!.focusSessions).toHaveLength(1);
    expect(result.plan!.focusSessions[0].title).toBe('Mock exam session');
  });

  it('drops focus sessions with an inverted time range', () => {
    const raw = structuredClone(fullPlan);
    raw.plan.focusSessions[1].endTime = raw.plan.focusSessions[1].startTime;

    const result = normalizeTaskPlanChatResponse(raw, now);
    expect(result.plan!.focusSessions.map((s) => s.title)).toEqual([
      'Chapter 4 session',
    ]);
  });

  it('drops reminders in the past', () => {
    const raw = structuredClone(fullPlan);
    raw.plan.reminders = [
      { title: 'Too late', remindAt: '2026-07-18T11:59:00.000Z', type: 'time' },
      { title: 'Still valid', remindAt: '2026-07-20T08:00:00.000Z', type: 'time' },
    ];

    const result = normalizeTaskPlanChatResponse(raw, now);
    expect(result.plan!.reminders.map((r) => r.title)).toEqual(['Still valid']);
  });

  it('sorts focus sessions and reminders chronologically', () => {
    const raw = structuredClone(fullPlan);
    raw.plan.focusSessions.reverse();
    raw.plan.reminders = [
      { title: 'Second', remindAt: '2026-07-22T08:00:00.000Z', type: 'time' },
      { title: 'First', remindAt: '2026-07-19T08:00:00.000Z', type: 'time' },
    ];

    const result = normalizeTaskPlanChatResponse(raw, now);
    expect(result.plan!.focusSessions[0].title).toBe('Chapter 4 session');
    expect(result.plan!.reminders.map((r) => r.title)).toEqual(['First', 'Second']);
  });

  it('downgrades a plan without a usable title to a question instead of erroring', () => {
    const raw = structuredClone(fullPlan);
    raw.plan.mainTask.title = '';

    const result = normalizeTaskPlanChatResponse(raw, now);
    expect(result.type).toBe('question');
    expect(result.plan).toBeUndefined();
  });

  it('falls back to a discovery question for unrecognized responses', () => {
    const result = normalizeTaskPlanChatResponse({ nonsense: true }, now);
    expect(result.type).toBe('question');
    expect(result.state).toBe('discovery');
    expect(result.message).toBeTruthy();
  });

  it('keeps advice responses with their quick replies and state', () => {
    const result = normalizeTaskPlanChatResponse(
      {
        type: 'advice',
        message: 'This needs about 20 hours but you only have 8 before Friday.',
        state: 'scope_refinement',
        quickReplies: ['Reduce scope', 'Extend deadline', 'Add hours'],
      },
      now,
    );

    expect(result.type).toBe('advice');
    expect(result.state).toBe('scope_refinement');
    expect(result.quickReplies).toEqual(['Reduce scope', 'Extend deadline', 'Add hours']);
  });

  it('clamps subtask minutes into the allowed range and preserves Arabic text', () => {
    const raw = structuredClone(fullPlan);
    raw.plan.subtasks = [
      { title: 'مراجعة الفصل الأول', description: 'حل جميع التمارين', estimatedMinutes: 1 },
      { title: 'Marathon', description: 'Too long', estimatedMinutes: 10_000 },
    ];

    const result = normalizeTaskPlanChatResponse(raw, now);
    expect(result.plan!.subtasks[0].title).toBe('مراجعة الفصل الأول');
    expect(result.plan!.subtasks[0].estimatedMinutes).toBe(5);
    expect(result.plan!.subtasks[1].estimatedMinutes).toBe(480);
  });
});
