import {
  affectedSubtaskIds,
  affectedUserIds,
  planChangesFor,
  subtaskOverridesFor,
} from './recommendation-changes';

const START = '2026-07-28T09:00:00.000Z';
const DUE = '2026-07-29T09:00:00.000Z';

describe('planChangesFor', () => {
  it('turns ahead_of_pace into a start-date-only reschedule', () => {
    const changes = planChangesFor({
      kind: 'ahead_of_pace',
      payload: { subtaskId: 'sub-1', newStartDate: START },
    });
    expect(changes).toEqual([{ kind: 'reschedule', subtaskId: 'sub-1', startDate: START }]);
  });

  it('turns deadline_risk into a reschedule of both start and due dates', () => {
    const changes = planChangesFor({
      kind: 'deadline_risk',
      payload: { moveSubtaskId: 'sub-2', newStartDate: START, newDueDate: DUE },
    });
    expect(changes).toEqual([
      { kind: 'reschedule', subtaskId: 'sub-2', startDate: START, dueDate: DUE },
    ]);
  });

  it('omits dueDate when deadline_risk carries no new due date', () => {
    const [change] = planChangesFor({
      kind: 'deadline_risk',
      payload: { moveSubtaskId: 'sub-2', newStartDate: START },
    });
    expect(change).not.toHaveProperty('dueDate');
  });

  it.each(['inactive_member', 'workload_imbalance'])('turns %s into a reassign', (kind) => {
    const changes = planChangesFor({
      kind,
      payload: { subtaskId: 'sub-3', fromUserId: 'u1', toUserId: 'u2' },
    });
    expect(changes).toEqual([
      { kind: 'reassign', subtaskId: 'sub-3', assigneeUserId: 'u2', fromUserId: 'u1' },
    ]);
  });

  it('produces no change for an unknown kind', () => {
    expect(planChangesFor({ kind: 'something_new', payload: { subtaskId: 'sub-1' } })).toEqual([]);
  });

  // A payload that has lost its target must yield NOTHING rather than a partial
  // edit — approve() turns an empty result into a clear error.
  it('produces no change when the reassign target is missing', () => {
    expect(planChangesFor({ kind: 'workload_imbalance', payload: { subtaskId: 'sub-3' } })).toEqual([]);
  });

  it('produces no change when the reschedule subtask is missing', () => {
    expect(planChangesFor({ kind: 'ahead_of_pace', payload: { newStartDate: START } })).toEqual([]);
  });

  it('produces no change for an unparseable date', () => {
    expect(
      planChangesFor({ kind: 'ahead_of_pace', payload: { subtaskId: 'sub-1', newStartDate: 'soon' } }),
    ).toEqual([]);
  });

  it('tolerates a null or empty payload', () => {
    expect(planChangesFor({ kind: 'ahead_of_pace', payload: null })).toEqual([]);
    expect(planChangesFor({ kind: 'ahead_of_pace', payload: {} })).toEqual([]);
  });

  it('ignores blank-string ids rather than treating them as targets', () => {
    expect(
      planChangesFor({ kind: 'workload_imbalance', payload: { subtaskId: '  ', toUserId: 'u2' } }),
    ).toEqual([]);
  });
});

describe('affectedSubtaskIds / affectedUserIds', () => {
  it('dedupes subtask ids while preserving order', () => {
    expect(
      affectedSubtaskIds([
        { kind: 'reassign', subtaskId: 'b', assigneeUserId: 'u1' },
        { kind: 'reschedule', subtaskId: 'a', startDate: START },
        { kind: 'reassign', subtaskId: 'b', assigneeUserId: 'u2' },
      ]),
    ).toEqual(['b', 'a']);
  });

  it('collects both sides of a move plus the recommendation subject', () => {
    const ids = affectedUserIds(
      [{ kind: 'reassign', subtaskId: 's', assigneeUserId: 'u2', fromUserId: 'u1' }],
      'u3',
    );
    expect(ids).toEqual(['u2', 'u1', 'u3']);
  });

  it('does not duplicate the subject when it is also a side of the move', () => {
    const ids = affectedUserIds(
      [{ kind: 'reassign', subtaskId: 's', assigneeUserId: 'u2', fromUserId: 'u1' }],
      'u1',
    );
    expect(ids).toEqual(['u2', 'u1']);
  });
});

describe('subtaskOverridesFor', () => {
  it('maps a reassign onto an assignee-only override', () => {
    expect(subtaskOverridesFor([{ kind: 'reassign', subtaskId: 's', assigneeUserId: 'u2' }])).toEqual([
      { subtaskId: 's', assigneeUserId: 'u2' },
    ]);
  });

  it('maps a reschedule onto real Date instances so the plan builder sees DB-shaped rows', () => {
    const [override] = subtaskOverridesFor([
      { kind: 'reschedule', subtaskId: 's', startDate: START, dueDate: DUE },
    ]);
    expect(override.startDate).toBeInstanceOf(Date);
    expect(override.startDate?.toISOString()).toBe(START);
    expect(override.dueDate?.toISOString()).toBe(DUE);
  });

  it('leaves dueDate untouched when the change does not set one', () => {
    const [override] = subtaskOverridesFor([{ kind: 'reschedule', subtaskId: 's', startDate: START }]);
    expect(override).not.toHaveProperty('dueDate');
  });
});
