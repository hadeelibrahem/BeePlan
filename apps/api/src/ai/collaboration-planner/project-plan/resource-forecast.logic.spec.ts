import { fallbackAvailability, type DayRange, type MemberAvailability } from './member-availability';
import type { ProjectPlanEdge, ProjectPlanNode, ProjectPlanSchedule } from './project-plan.logic';
import {
  buildResourceForecast,
  type Priority,
  type ResourceForecastInput,
} from './resource-forecast.logic';

// A fixed Monday 08:00 UTC. All test availabilities use identical windows on every
// weekday, so assertions never depend on which weekday `now` lands on.
const NOW = new Date('2026-07-27T08:00:00.000Z');

function at(minutesFromNow: number, base: Date = NOW): string {
  return new Date(base.getTime() + minutesFromNow * 60_000).toISOString();
}

function avail(
  userId: string,
  opts: {
    windows?: DayRange[];
    preferred?: DayRange[];
    maxDaily?: number;
    offset?: number;
    hasData?: boolean;
    name?: string;
  } = {},
): MemberAvailability {
  const windows = opts.windows ?? [{ start: 480, end: 1260 }]; // 08:00–21:00
  const preferred = opts.preferred ?? [];
  return {
    userId,
    displayName: opts.name ?? userId,
    offsetMinutes: opts.offset ?? 0,
    maxDailyWorkMinutes: opts.maxDaily ?? 1000,
    freeWindowsByWeekday: Array.from({ length: 7 }, () => windows.map((w) => ({ ...w }))),
    preferredWindowsByWeekday: Array.from({ length: 7 }, () => preferred.map((w) => ({ ...w }))),
    hasData: opts.hasData ?? true,
  };
}

let seq = 0;
function node(over: Partial<ProjectPlanNode> = {}): ProjectPlanNode {
  seq += 1;
  return {
    id: `n${seq}`,
    entityType: 'subtask',
    parentTaskId: 't',
    title: `Item ${seq}`,
    status: 'todo',
    assignee: { userId: 'u1', displayName: 'Alice' },
    estimatedMinutes: 60,
    actualMinutes: 0,
    remainingMinutes: 60,
    plannedStart: null,
    plannedEnd: null,
    forecastStart: null,
    forecastEnd: null,
    dueDate: null,
    progressPercent: 0,
    isBlocked: false,
    blockedByIds: [],
    blockingIds: [],
    focusSummary: null,
    isExternal: false,
    isGroup: false,
    layer: 0,
    inCycle: false,
    isUnscheduled: true,
    ...over,
  };
}

function edge(sourceId: string, targetId: string): ProjectPlanEdge {
  return { id: `${sourceId}->${targetId}`, sourceId, targetId, dependencyType: 'subtask' };
}

function run(
  nodes: ProjectPlanNode[],
  edges: ProjectPlanEdge[],
  opts: {
    cyclic?: Set<string>;
    scheduling?: Record<string, ProjectPlanSchedule>;
    priorityById?: Map<string, Priority>;
    availabilityByUser?: Map<string, MemberAvailability>;
    deadline?: Date | null;
    now?: Date;
    offset?: number;
  } = {},
) {
  const input: ResourceForecastInput = {
    nodes,
    edges,
    cyclic: opts.cyclic ?? new Set(),
    scheduling: opts.scheduling ?? {},
    priorityById: opts.priorityById ?? new Map(),
    availabilityByUser: opts.availabilityByUser ?? new Map(),
    makeFallback: (id, name) => fallbackAvailability(id, name, opts.offset ?? 0),
    fallbackPolicy: 'FALLBACK',
    deadline: opts.deadline ?? null,
    now: opts.now ?? NOW,
  };
  return buildResourceForecast(input);
}

beforeEach(() => {
  seq = 0;
});

describe('resource-aware forecast', () => {
  it('schedules two different members in parallel', () => {
    const a = node({ id: 'a', assignee: { userId: 'u1', displayName: 'Alice' } });
    const b = node({ id: 'b', assignee: { userId: 'u2', displayName: 'Bob' } });
    const availabilityByUser = new Map([
      ['u1', avail('u1')],
      ['u2', avail('u2')],
    ]);
    const result = run([a, b], [], { availabilityByUser });
    const fa = result.nodeForecasts.get('a')!;
    const fb = result.nodeForecasts.get('b')!;
    expect(fa.forecastStart).toBe(at(0));
    expect(fa.forecastEnd).toBe(at(60));
    // Bob starts in parallel, not after Alice.
    expect(fb.forecastStart).toBe(at(0));
    expect(fb.forecastEnd).toBe(at(60));
    expect(result.forecast.projectedCompletion).toBe(at(60));
    expect(result.forecast.status).toBe('available');
  });

  it('serializes two items assigned to the SAME member (no overlap)', () => {
    const a = node({ id: 'a' });
    const b = node({ id: 'b' });
    const availabilityByUser = new Map([['u1', avail('u1')]]);
    const result = run([a, b], [], { availabilityByUser });
    const fa = result.nodeForecasts.get('a')!;
    const fb = result.nodeForecasts.get('b')!;
    // Both 08:00–09:00 is impossible for one member; the second follows the first.
    const windows = [fa, fb].map((f) => [f.forecastStart, f.forecastEnd]).sort();
    expect(windows).toEqual([
      [at(0), at(60)],
      [at(60), at(120)],
    ]);
    // The one pushed later records the resource conflict it waited through.
    const later = fa.forecastStart === at(60) ? fa : fb;
    expect(later.resourceConflictMinutes).toBe(60);
  });

  it('respects a dependency chain', () => {
    const a = node({ id: 'a', remainingMinutes: 60 });
    const b = node({ id: 'b', remainingMinutes: 30 });
    const result = run([a, b], [edge('a', 'b')], {
      availabilityByUser: new Map([['u1', avail('u1')]]),
    });
    expect(result.nodeForecasts.get('a')!.forecastEnd).toBe(at(60));
    expect(result.nodeForecasts.get('b')!.forecastStart).toBe(at(60));
    expect(result.nodeForecasts.get('b')!.forecastEnd).toBe(at(90));
  });

  it('completed work contributes 0 minutes and unblocks its dependent immediately', () => {
    const a = node({ id: 'a', status: 'done', progressPercent: 100 });
    const b = node({ id: 'b', remainingMinutes: 45 });
    const result = run([a, b], [edge('a', 'b')], {
      availabilityByUser: new Map([['u1', avail('u1')]]),
    });
    expect(result.nodeForecasts.get('a')!.forecastStatus).toBe('complete');
    // b starts at now, not delayed by the already-finished a.
    expect(result.nodeForecasts.get('b')!.forecastStart).toBe(at(0));
    expect(result.nodeForecasts.get('b')!.forecastEnd).toBe(at(45));
  });

  it('in-progress work uses only the remaining minutes', () => {
    const a = node({ id: 'a', estimatedMinutes: 120, actualMinutes: 90, remainingMinutes: 30, status: 'in_progress', progressPercent: 75 });
    const result = run([a], [], { availabilityByUser: new Map([['u1', avail('u1')]]) });
    expect(result.nodeForecasts.get('a')!.forecastEnd).toBe(at(30));
  });

  it('leaves an unassigned item unscheduled (never auto-assigns)', () => {
    const a = node({ id: 'a', assignee: null });
    const result = run([a], [], {});
    const fa = result.nodeForecasts.get('a')!;
    expect(fa.forecastStatus).toBe('unscheduled');
    expect(fa.assigneeId).toBeNull();
    expect(result.forecast.unscheduledItemIds).toContain('a');
    expect(result.forecast.status).toBe('unavailable');
  });

  it('leaves an estimate-less item unscheduled (never invents an estimate)', () => {
    const a = node({ id: 'a', estimatedMinutes: null, remainingMinutes: null });
    const result = run([a], [], { availabilityByUser: new Map([['u1', avail('u1')]]) });
    expect(result.nodeForecasts.get('a')!.forecastStatus).toBe('unscheduled');
    expect(result.forecast.unscheduledItemIds).toContain('a');
  });

  it('reports zero capacity when the member has no available working time', () => {
    const a = node({ id: 'a' });
    const result = run([a], [], { availabilityByUser: new Map([['u1', avail('u1', { windows: [] })]]) });
    const fa = result.nodeForecasts.get('a')!;
    expect(fa.forecastStatus).toBe('unscheduled');
    expect(fa.forecastReason).toMatch(/no available working time/i);
    expect(result.forecast.capacityShortfallMinutes).toBe(60);
  });

  it('schedules around a recurring-commitment gap in the day', () => {
    // Free windows 08:00–09:00 and 10:00–21:00 (a 09:00–10:00 commitment carved out).
    const a = node({ id: 'a', remainingMinutes: 90 });
    const windows: DayRange[] = [
      { start: 480, end: 540 },
      { start: 600, end: 1260 },
    ];
    const result = run([a], [], { availabilityByUser: new Map([['u1', avail('u1', { windows })]]) });
    const fa = result.nodeForecasts.get('a')!;
    expect(fa.forecastStart).toBe(at(0)); // 08:00
    // 60 min before the gap + 30 min after → ends 10:30 (150 min after 08:00).
    expect(fa.forecastEnd).toBe(at(150));
  });

  it('flags work scheduled outside preferred focus hours', () => {
    // Preferred window 08:00–11:00 only; a 300-min task overruns it.
    const a = node({ id: 'a', remainingMinutes: 300 });
    const availability = avail('u1', { preferred: [{ start: 480, end: 660 }] });
    const result = run([a], [], { availabilityByUser: new Map([['u1', availability]]) });
    expect(result.nodeForecasts.get('a')!.forecastReason).toMatch(/outside preferred hours/i);
  });

  it('detects an overloaded member relative to the deadline (bottleneck)', () => {
    const a = node({ id: 'a', remainingMinutes: 300 });
    const availability = avail('u1', { maxDaily: 120, name: 'Alice' });
    const result = run([a], [], {
      availabilityByUser: new Map([['u1', availability]]),
      deadline: new Date(NOW.getTime() + 13 * 60 * 60_000), // same day 21:00
    });
    const lane = result.lanes.find((l) => l.assigneeId === 'u1')!;
    expect(lane.scheduledMinutes).toBe(300);
    expect(lane.availableMinutes).toBe(120); // capped by maxDaily on the single deadline day
    expect(lane.overloadMinutes).toBe(180);
    expect(result.forecast.bottleneckAssignee).toMatchObject({ assigneeId: 'u1', overloadMinutes: 180 });
  });

  it('orders ready items deterministically, critical first', () => {
    // Two items for the same member; only b is critical, so it schedules first.
    const a = node({ id: 'a' });
    const b = node({ id: 'b' });
    const scheduling: Record<string, ProjectPlanSchedule> = {
      a: { isCritical: false, totalFloatMinutes: 120 },
      b: { isCritical: true, totalFloatMinutes: 0 },
    };
    const result = run([a, b], [], { scheduling, availabilityByUser: new Map([['u1', avail('u1')]]) });
    expect(result.nodeForecasts.get('b')!.forecastStart).toBe(at(0));
    expect(result.nodeForecasts.get('a')!.forecastStart).toBe(at(60));
  });

  it('returns unavailable for a dependency cycle (never invents a forecast)', () => {
    const a = node({ id: 'a', inCycle: true });
    const b = node({ id: 'b', inCycle: true });
    const result = run([a, b], [edge('a', 'b'), edge('b', 'a')], { cyclic: new Set(['a', 'b']) });
    expect(result.forecast.status).toBe('unavailable');
    expect(result.nodeForecasts.get('a')!.forecastStatus).toBe('in_cycle');
    expect(result.forecast.projectedCompletion).toBeNull();
  });

  it('computes delay when the projection misses the deadline', () => {
    // 600 min of work, capped at 480/day → spills into a second day.
    const a = node({ id: 'a', remainingMinutes: 600 });
    const result = run([a], [], {
      availabilityByUser: new Map([['u1', avail('u1', { maxDaily: 480 })]]),
      deadline: new Date(NOW.getTime() + 4 * 60 * 60_000), // same day 12:00
    });
    expect(result.forecast.delayMinutes).toBeGreaterThan(0);
    expect(result.forecast.delayDays).toBe(1);
    expect(result.forecast.reasons.some((r) => /after the deadline/i.test(r))).toBe(true);
  });

  it('is partial when some items schedule and others cannot', () => {
    const a = node({ id: 'a' });
    const b = node({ id: 'b', estimatedMinutes: null, remainingMinutes: null });
    const result = run([a, b], [], { availabilityByUser: new Map([['u1', avail('u1')]]) });
    expect(result.forecast.status).toBe('partial');
    expect(result.nodeForecasts.get('a')!.forecastStatus).toBe('scheduled');
    expect(result.forecast.unscheduledItemIds).toEqual(['b']);
  });

  it('honors the member timezone offset at the day boundary', () => {
    // offset +120 → local = UTC + 2h. now 06:00 UTC = 08:00 local, the window start.
    const now = new Date('2026-07-27T06:00:00.000Z');
    const a = node({ id: 'a', remainingMinutes: 60 });
    const availability = avail('u1', { offset: 120 });
    const result = run([a], [], { availabilityByUser: new Map([['u1', availability]]), now });
    // Work begins at 08:00 local, i.e. exactly `now` (06:00Z).
    expect(result.nodeForecasts.get('a')!.forecastStart).toBe(now.toISOString());
  });

  it('surfaces the fallback policy when a member relies on default availability', () => {
    // No availability provided → makeFallback (hasData: false) is used.
    const a = node({ id: 'a' });
    const result = run([a], [], {});
    expect(result.forecast.fallbackPolicy).toBe('FALLBACK');
  });

  it('produces identical output for identical input', () => {
    const build = () => {
      seq = 0;
      const a = node({ id: 'a' });
      const b = node({ id: 'b', assignee: { userId: 'u2', displayName: 'Bob' } });
      const c = node({ id: 'c', remainingMinutes: 45 });
      return run([a, b, c], [edge('a', 'c')], {
        availabilityByUser: new Map([
          ['u1', avail('u1')],
          ['u2', avail('u2')],
        ]),
      });
    };
    const first = build();
    const second = build();
    expect(serialise(second)).toEqual(serialise(first));
  });
});

function serialise(result: ReturnType<typeof run>) {
  return {
    forecast: result.forecast,
    lanes: result.lanes,
    nodeForecasts: [...result.nodeForecasts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
  };
}
