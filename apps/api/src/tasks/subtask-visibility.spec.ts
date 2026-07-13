import {
  canModifySubtask,
  filterVisibleSubtasks,
  isSubtaskVisibleToViewer,
  type VisibilitySubtask,
} from './subtask-visibility';

const ME = 'user-me';
const OTHER = 'user-other';

function sub(
  id: string,
  assigneeUserId: string | null,
  isShared = false,
): VisibilitySubtask & { id: string } {
  return { id, assigneeUserId, isShared };
}

const rows = [
  sub('mine', ME),
  sub('others', OTHER),
  sub('shared', null, true),
  sub('shared-assigned-other', OTHER, true),
  sub('unassigned', null),
];

describe('isSubtaskVisibleToViewer', () => {
  it('shows everything to the owner', () => {
    expect(
      rows.every((r) => isSubtaskVisibleToViewer(r, { userId: ME, role: 'owner' })),
    ).toBe(true);
  });

  it('shows everything to a viewer (read-only, full visibility)', () => {
    expect(
      rows.every((r) => isSubtaskVisibleToViewer(r, { userId: ME, role: 'viewer' })),
    ).toBe(true);
  });

  it("hides another member's personal subtask from an editor", () => {
    const visible = rows.filter((r) =>
      isSubtaskVisibleToViewer(r, { userId: ME, role: 'editor' }),
    );
    expect(visible.map((r) => r.id).sort()).toEqual(
      ['mine', 'shared', 'shared-assigned-other', 'unassigned'].sort(),
    );
    expect(visible.some((r) => r.id === 'others')).toBe(false);
  });
});

describe('filterVisibleSubtasks refinement views', () => {
  it('owner "member" filter selects only that member', () => {
    const visible = filterVisibleSubtasks(rows, {
      userId: ME,
      role: 'owner',
      view: 'member',
      assigneeId: OTHER,
    });
    expect(visible.map((r) => r.id).sort()).toEqual(
      ['others', 'shared-assigned-other'].sort(),
    );
  });

  it('"mine" filter selects only the viewer\'s own', () => {
    const visible = filterVisibleSubtasks(rows, {
      userId: ME,
      role: 'owner',
      view: 'mine',
    });
    expect(visible.map((r) => r.id)).toEqual(['mine']);
  });

  it('"shared" filter selects only shared subtasks', () => {
    const visible = filterVisibleSubtasks(rows, {
      userId: ME,
      role: 'owner',
      view: 'shared',
    });
    expect(visible.map((r) => r.id).sort()).toEqual(
      ['shared', 'shared-assigned-other'].sort(),
    );
  });

  it('"unassigned" filter excludes shared and assigned subtasks', () => {
    const visible = filterVisibleSubtasks(rows, {
      userId: ME,
      role: 'owner',
      view: 'unassigned',
    });
    expect(visible.map((r) => r.id)).toEqual(['unassigned']);
  });

  it('an editor cannot escape the base rule via view: member on another user', () => {
    const visible = filterVisibleSubtasks(rows, {
      userId: ME,
      role: 'editor',
      view: 'member',
      assigneeId: OTHER,
    });
    // Base rule hides 'others'; only the shared-but-assigned-to-other survives.
    expect(visible.map((r) => r.id)).toEqual(['shared-assigned-other']);
  });

  it('an editor cannot escape the base rule via view: all', () => {
    const visible = filterVisibleSubtasks(rows, {
      userId: ME,
      role: 'editor',
      view: 'all',
    });
    expect(visible.some((r) => r.id === 'others')).toBe(false);
  });
});

describe('canModifySubtask', () => {
  it('lets the owner modify anything', () => {
    expect(
      rows.every((r) => canModifySubtask(r, { userId: ME, role: 'owner' })),
    ).toBe(true);
  });

  it("forbids an editor from modifying another member's personal subtask", () => {
    expect(
      canModifySubtask(sub('x', OTHER), { userId: ME, role: 'editor' }),
    ).toBe(false);
  });

  it('lets an editor modify own, shared, and unassigned subtasks', () => {
    expect(canModifySubtask(sub('x', ME), { userId: ME, role: 'editor' })).toBe(true);
    expect(
      canModifySubtask(sub('x', null, true), { userId: ME, role: 'editor' }),
    ).toBe(true);
    expect(canModifySubtask(sub('x', null), { userId: ME, role: 'editor' })).toBe(true);
  });

  it('forbids a viewer from modifying anything', () => {
    expect(
      rows.some((r) => canModifySubtask(r, { userId: ME, role: 'viewer' })),
    ).toBe(false);
  });
});
