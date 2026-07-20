import {
  buildBlocks,
  repairFocusSchedule,
  repairPlanResponse,
  type RepairContext,
  type ScheduleConstraints,
} from './task-plan-schedule';
import type {
  TaskPlan,
  TaskPlanChatResponse,
  TaskPlanFocusSession,
  TaskPlanReminder,
} from './task-plan';

// All times UTC. "Now" for the suite is 2026-07-18T09:00:00Z.
const NOW = new Date('2026-07-18T09:00:00.000Z');

function iso(day: string, hhmm: string): string {
  return `${day}T${hhmm}:00.000Z`;
}

function session(
  day: string,
  start: string,
  end: string,
  related: string,
  title = related,
): TaskPlanFocusSession {
  return { title, startTime: iso(day, start), endTime: iso(day, end), relatedSubtaskTitle: related };
}

function plan(overrides: Partial<TaskPlan>): TaskPlan {
  return {
    mainTask: {
      title: 'Goal',
      description: '',
      dueDate: '2026-07-25T23:59:00.000Z',
      priority: 'medium',
      ...(overrides.mainTask ?? {}),
    },
    subtasks: overrides.subtasks ?? [],
    focusSessions: overrides.focusSessions ?? [],
    reminders: overrides.reminders ?? [],
  };
}

function constraints(overrides: Partial<ScheduleConstraints> = {}): ScheduleConstraints {
  return {
    now: NOW,
    deadline: new Date('2026-07-25T23:59:00.000Z'),
    focusStartMinutes: 18 * 60, // 18:00
    focusEndMinutes: 21 * 60, // 21:00
    workBlockMinutes: 45,
    breakMinutes: 15,
    busyDays: new Set<string>(),
    ...overrides,
  };
}

function durations(sessions: TaskPlanFocusSession[], related?: string): number[] {
  return sessions
    .filter((s) => !related || s.relatedSubtaskTitle === related)
    .map((s) => (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000);
}

function totalFor(sessions: TaskPlanFocusSession[], related: string): number {
  return durations(sessions, related).reduce((a, b) => a + b, 0);
}

describe('buildBlocks', () => {
  it('splits a 240-minute estimate into 45-minute blocks plus a remainder', () => {
    expect(buildBlocks(240, 45)).toEqual([45, 45, 45, 45, 45, 15]);
    expect(buildBlocks(240, 45).reduce((a, b) => a + b, 0)).toBe(240);
  });

  it('splits an even multiple with no remainder', () => {
    expect(buildBlocks(90, 45)).toEqual([45, 45]);
  });

  it('returns a single block when the estimate is at or below the block size', () => {
    expect(buildBlocks(30, 45)).toEqual([30]);
    expect(buildBlocks(45, 45)).toEqual([45]);
  });

  it('places all full blocks before the shorter remainder (110m / 50m => [50,50,10])', () => {
    expect(buildBlocks(110, 50)).toEqual([50, 50, 10]);
  });

  it('produces no remainder when the estimate divides evenly', () => {
    expect(buildBlocks(150, 50)).toEqual([50, 50, 50]);
    expect(buildBlocks(135, 45)).toEqual([45, 45, 45]);
  });
});

describe('repairFocusSchedule', () => {
  it('splits an oversized session (90m with a 45m block) into two blocks', () => {
    const p = plan({
      subtasks: [{ title: 'Study', description: '', estimatedMinutes: 90, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '19:30', 'Study')], // one 90m session
    });
    const result = repairFocusSchedule(p, constraints());
    expect(durations(result.focusSessions, 'Study')).toEqual([45, 45]);
    expect(totalFor(result.focusSessions, 'Study')).toBe(90);
  });

  it('splits a 240m subtask into five 45m blocks and a 15m remainder', () => {
    const p = plan({
      subtasks: [{ title: 'Build', description: '', estimatedMinutes: 240, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '19:30', 'Build')], // under-scheduled + oversized
    });
    const result = repairFocusSchedule(p, constraints());
    expect(durations(result.focusSessions, 'Build').sort((a, b) => b - a)).toEqual([
      45, 45, 45, 45, 45, 15,
    ]);
    expect(totalFor(result.focusSessions, 'Build')).toBe(240);
  });

  it('repairs an under-scheduled subtask up to ~100% coverage', () => {
    const p = plan({
      subtasks: [{ title: 'Revise', description: '', estimatedMinutes: 120, order: 1 }],
      // Model scheduled only 45m of 120m => 37% coverage.
      focusSessions: [session('2026-07-19', '18:00', '18:45', 'Revise')],
    });
    const result = repairFocusSchedule(p, constraints());
    const total = totalFor(result.focusSessions, 'Revise');
    expect(total).toBeGreaterThanOrEqual(120 * 0.9);
    expect(total).toBeLessThanOrEqual(120 * 1.1);
  });

  it('preserves a 90m fixed mock-exam session (never splits it) while repairing other work', () => {
    const p = plan({
      subtasks: [
        { title: 'Full mock exam', description: '', estimatedMinutes: 90, order: 1 },
        { title: 'Review weak areas', description: '', estimatedMinutes: 120, order: 2 },
      ],
      focusSessions: [
        session('2026-07-19', '18:00', '19:30', 'Full mock exam', 'Mock exam simulation'),
        // Under-scheduled -> forces the schedule into repair.
        session('2026-07-20', '18:00', '18:30', 'Review weak areas'),
      ],
    });
    const result = repairFocusSchedule(p, constraints());
    const mock = durations(result.focusSessions, 'Full mock exam');
    expect(mock).toEqual([90]); // preserved, not split into 45+45
    expect(totalFor(result.focusSessions, 'Review weak areas')).toBeGreaterThanOrEqual(120 * 0.9);
  });

  it('leaves an already-valid schedule completely unchanged', () => {
    const sessions = [
      session('2026-07-19', '18:00', '18:45', 'A'),
      session('2026-07-19', '19:00', '19:45', 'A'),
      session('2026-07-20', '18:00', '18:45', 'B'),
    ];
    const p = plan({
      subtasks: [
        { title: 'A', description: '', estimatedMinutes: 90, order: 1 },
        { title: 'B', description: '', estimatedMinutes: 45, order: 2 },
      ],
      focusSessions: sessions,
    });
    const result = repairFocusSchedule(p, constraints());
    expect(result.focusSessions).toEqual(sessions);
    expect(result.feasibility.fits).toBe(true);
  });

  it('does not schedule a subtask that the model never scheduled', () => {
    const p = plan({
      subtasks: [
        { title: 'Write', description: '', estimatedMinutes: 240, order: 1 }, // oversized -> triggers repair
        { title: 'Call the venue', description: '', estimatedMinutes: 20, order: 2 }, // errand, no session
      ],
      focusSessions: [session('2026-07-19', '18:00', '20:00', 'Write')],
    });
    const result = repairFocusSchedule(p, constraints());
    expect(totalFor(result.focusSessions, 'Call the venue')).toBe(0);
    expect(result.focusSessions.some((s) => s.relatedSubtaskTitle === 'Call the venue')).toBe(false);
  });

  it('inserts at least breakMinutes between consecutive same-day sessions', () => {
    const p = plan({
      subtasks: [{ title: 'Deck', description: '', estimatedMinutes: 135, order: 1 }],
      // Back-to-back with no break (invalid) -> repair.
      focusSessions: [
        session('2026-07-19', '18:00', '18:45', 'Deck'),
        session('2026-07-19', '18:45', '19:30', 'Deck'),
        session('2026-07-19', '19:30', '20:15', 'Deck'),
      ],
    });
    const result = repairFocusSchedule(p, constraints({ breakMinutes: 15 }));
    const byDay = result.focusSessions
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < byDay.length; i += 1) {
      if (byDay[i].startTime.slice(0, 10) === byDay[i - 1].startTime.slice(0, 10)) {
        const gap =
          (new Date(byDay[i].startTime).getTime() - new Date(byDay[i - 1].endTime).getTime()) / 60000;
        expect(gap).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('removes overlaps between sessions', () => {
    const p = plan({
      subtasks: [{ title: 'X', description: '', estimatedMinutes: 90, order: 1 }],
      focusSessions: [
        session('2026-07-19', '18:00', '19:00', 'X'), // overlaps the next
        session('2026-07-19', '18:30', '19:30', 'X'),
      ],
    });
    const result = repairFocusSchedule(p, constraints());
    const sorted = result.focusSessions
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      expect(new Date(sorted[i].startTime).getTime()).toBeGreaterThanOrEqual(
        new Date(sorted[i - 1].endTime).getTime(),
      );
    }
  });

  it('keeps all repaired sessions inside the working band', () => {
    const p = plan({
      subtasks: [{ title: 'Y', description: '', estimatedMinutes: 200, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '21:20', 'Y')], // runs past 21:00 + oversized
    });
    const c = constraints({ focusStartMinutes: 18 * 60, focusEndMinutes: 21 * 60 });
    const result = repairFocusSchedule(p, c);
    for (const s of result.focusSessions) {
      const startMin = new Date(s.startTime).getUTCHours() * 60 + new Date(s.startTime).getUTCMinutes();
      const endMin = new Date(s.endTime).getUTCHours() * 60 + new Date(s.endTime).getUTCMinutes();
      expect(startMin).toBeGreaterThanOrEqual(18 * 60);
      expect(endMin).toBeLessThanOrEqual(21 * 60);
    }
  });

  it('keeps a rebuilt remainder last across a day boundary', () => {
    const p = plan({
      mainTask: { title: 'G', description: '', dueDate: '2026-07-22T23:59:00.000Z', priority: 'high' },
      subtasks: [{ title: 'Study', description: '', estimatedMinutes: 110, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '19:50', 'Study')], // 110m oversized -> rebuild
    });
    // Band fits one 50m block per day, forcing [50, 50, 10] across three days.
    const c = constraints({
      deadline: new Date('2026-07-22T23:59:00.000Z'),
      focusStartMinutes: 18 * 60,
      focusEndMinutes: 18 * 60 + 50,
      workBlockMinutes: 50,
      breakMinutes: 10,
    });
    const result = repairFocusSchedule(p, c);
    // result.focusSessions is chronological; the remainder must be last.
    expect(durations(result.focusSessions, 'Study')).toEqual([50, 50, 10]);
  });

  it('keeps the remainder last even when a busy anchor day forces the fallback', () => {
    const p = plan({
      mainTask: { title: 'G', description: '', dueDate: '2026-07-21T23:59:00.000Z', priority: 'high' },
      subtasks: [{ title: 'Study', description: '', estimatedMinutes: 110, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '19:50', 'Study')], // 110m on the busy anchor day
    });
    // One 50m block per day; only 3 usable days (19 busy, 20, 21). The old
    // two-phase fallback placed the leftover remainder on the earlier busy day,
    // producing [10, 50, 50]; the single chronological re-pack must yield
    // [50, 50, 10].
    const c = constraints({
      deadline: new Date('2026-07-21T23:59:00.000Z'),
      focusStartMinutes: 18 * 60,
      focusEndMinutes: 18 * 60 + 50,
      workBlockMinutes: 50,
      breakMinutes: 10,
      busyDays: new Set(['2026-07-19']),
    });
    const result = repairFocusSchedule(p, c);
    expect(durations(result.focusSessions, 'Study')).toEqual([50, 50, 10]);
    expect(result.feasibility.fits).toBe(true);
  });

  it('moves overflow work onto the next available day', () => {
    const p = plan({
      // 3h band per day (18-21); 300m of work needs a second day.
      subtasks: [{ title: 'Big', description: '', estimatedMinutes: 300, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '19:30', 'Big')],
    });
    const result = repairFocusSchedule(p, constraints());
    const days = new Set(result.focusSessions.map((s) => s.startTime.slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(2);
  });

  it('never places a session in the past', () => {
    const p = plan({
      subtasks: [{ title: 'Z', description: '', estimatedMinutes: 90, order: 1 }],
      // A session earlier today than NOW (09:00) — invalid.
      focusSessions: [session('2026-07-18', '07:00', '08:30', 'Z')],
    });
    const c = constraints({ focusStartMinutes: 6 * 60, focusEndMinutes: 22 * 60 });
    const result = repairFocusSchedule(p, c);
    for (const s of result.focusSessions) {
      expect(new Date(s.startTime).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('never ends a session after the deadline', () => {
    const deadline = new Date('2026-07-20T21:00:00.000Z');
    const p = plan({
      mainTask: { title: 'G', description: '', dueDate: deadline.toISOString(), priority: 'high' },
      subtasks: [{ title: 'W', description: '', estimatedMinutes: 200, order: 1 }],
      focusSessions: [session('2026-07-21', '18:00', '21:20', 'W')], // after deadline + oversized
    });
    const result = repairFocusSchedule(p, constraints({ deadline }));
    for (const s of result.focusSessions) {
      expect(new Date(s.endTime).getTime()).toBeLessThanOrEqual(deadline.getTime());
    }
  });

  it('avoids busy days when non-busy days are available', () => {
    const p = plan({
      subtasks: [{ title: 'Prep', description: '', estimatedMinutes: 90, order: 1 }],
      focusSessions: [session('2026-07-19', '18:00', '19:30', 'Prep')], // oversized -> repair
    });
    const result = repairFocusSchedule(p, constraints({ busyDays: new Set(['2026-07-19']) }));
    expect(result.focusSessions.every((s) => s.startTime.slice(0, 10) !== '2026-07-19')).toBe(true);
    expect(result.focusSessions.length).toBeGreaterThan(0);
  });

  it('surfaces an impossible-to-fit workload instead of hiding it', () => {
    const deadline = new Date('2026-07-19T21:00:00.000Z'); // ~1.5 days, tiny band
    const p = plan({
      mainTask: { title: 'G', description: '', dueDate: deadline.toISOString(), priority: 'high' },
      subtasks: [{ title: 'Huge', description: '', estimatedMinutes: 1200, order: 1 }], // 20h
      focusSessions: [session('2026-07-19', '18:00', '18:45', 'Huge')],
    });
    const result = repairFocusSchedule(p, constraints({ deadline }));
    expect(result.feasibility.fits).toBe(false);
    expect(result.feasibility.unplacedMinutes).toBeGreaterThan(0);
    expect(result.feasibility.unplacedSubtasks).toContain('Huge');
  });

  it('removes a reminder scheduled after the deadline (and in the past)', () => {
    const deadline = new Date('2026-07-25T23:59:00.000Z');
    const reminders: TaskPlanReminder[] = [
      { title: 'past', remindAt: '2026-07-17T08:00:00.000Z', type: 'time' },
      { title: 'ok', remindAt: '2026-07-20T08:00:00.000Z', type: 'time' },
      { title: 'after deadline', remindAt: '2026-07-26T08:00:00.000Z', type: 'time' },
    ];
    const p = plan({ subtasks: [], focusSessions: [], reminders });
    const result = repairFocusSchedule(p, constraints({ deadline }));
    expect(result.reminders.map((r) => r.title)).toEqual(['ok']);
  });
});

describe('repairPlanResponse (orchestrator)', () => {
  const ctx: RepairContext = {
    now: NOW,
    preferences: {
      focusStartTime: '18:00',
      focusEndTime: '21:00',
      workBlockMinutes: 45,
      breakMinutes: 15,
    },
    busyDays: [],
  };

  it('passes non-plan responses through untouched (Arabic question unchanged)', () => {
    const response: TaskPlanChatResponse = {
      type: 'question',
      message: 'ما هو الموعد النهائي لهذا الهدف؟',
      state: 'discovery',
      quickReplies: ['نعم', 'لا'],
    };
    expect(repairPlanResponse(response, ctx)).toEqual(response);
  });

  it('keeps an Arabic plan message unchanged when the schedule fits, and repairs sessions', () => {
    const response: TaskPlanChatResponse = {
      type: 'plan',
      message: 'إليك خطتك. راجعها ثم احفظها.',
      state: 'save_ready',
      plan: plan({
        subtasks: [{ title: 'مراجعة', description: 'حل التمارين', estimatedMinutes: 90, order: 1 }],
        focusSessions: [session('2026-07-19', '18:00', '19:30', 'مراجعة')], // oversized -> repaired
      }),
    };
    const repaired = repairPlanResponse(response, ctx);
    expect(repaired.type).toBe('plan');
    expect(repaired.message).toBe('إليك خطتك. راجعها ثم احفظها.'); // unchanged, still Arabic
    expect(durations(repaired.plan!.focusSessions, 'مراجعة')).toEqual([45, 45]);
    // JSON contract shape preserved.
    expect(repaired.plan!.focusSessions[0]).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        startTime: expect.any(String),
        endTime: expect.any(String),
        relatedSubtaskTitle: 'مراجعة',
      }),
    );
  });

  it('attaches a feasibility signal to message and risks when work overflows', () => {
    const deadline = '2026-07-19T21:00:00.000Z';
    const response: TaskPlanChatResponse = {
      type: 'plan',
      message: 'Here is your plan.',
      state: 'save_ready',
      understoodSummary: {
        goal: 'Cram',
        goalType: 'study',
        deadline,
        availableTime: null,
        currentProgress: null,
        deliverables: [],
        constraints: [],
        risks: ['existing risk'],
      },
      plan: plan({
        mainTask: { title: 'Cram', description: '', dueDate: deadline, priority: 'high' },
        subtasks: [{ title: 'Huge', description: '', estimatedMinutes: 1200, order: 1 }],
        focusSessions: [session('2026-07-19', '18:00', '18:45', 'Huge')],
      }),
    };
    const repaired = repairPlanResponse(response, ctx);
    expect(repaired.type).toBe('plan'); // still returns the best-effort plan
    expect(repaired.message).toContain("couldn't be scheduled before the deadline");
    expect(repaired.understoodSummary!.risks).toContain('existing risk');
    expect(repaired.understoodSummary!.risks.some((r) => r.startsWith('Schedule overflow'))).toBe(
      true,
    );
  });

  it('is deterministic: repeated runs produce identical output', () => {
    const response: TaskPlanChatResponse = {
      type: 'plan',
      message: 'Plan',
      state: 'save_ready',
      plan: plan({
        subtasks: [{ title: 'T', description: '', estimatedMinutes: 240, order: 1 }],
        focusSessions: [session('2026-07-19', '18:00', '20:00', 'T')],
      }),
    };
    const a = repairPlanResponse(response, ctx);
    const b = repairPlanResponse(response, ctx);
    expect(a).toEqual(b);
  });
});
