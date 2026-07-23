import { isSubtaskOwnedByUser } from './subtask-ownership';

const USER = 'user-1';
const OTHER = 'user-2';

describe('isSubtaskOwnedByUser', () => {
  describe('personal (non-shared) task', () => {
    it('treats every subtask as the owner’s, regardless of assignee', () => {
      expect(isSubtaskOwnedByUser({ assigneeUserId: null }, USER, false)).toBe(
        true,
      );
      expect(isSubtaskOwnedByUser({ assigneeUserId: OTHER }, USER, false)).toBe(
        true,
      );
    });
  });

  describe('shared task', () => {
    it('includes a subtask assigned to the current user', () => {
      expect(isSubtaskOwnedByUser({ assigneeUserId: USER }, USER, true)).toBe(
        true,
      );
    });

    it('excludes a subtask assigned to another member', () => {
      expect(isSubtaskOwnedByUser({ assigneeUserId: OTHER }, USER, true)).toBe(
        false,
      );
    });

    it('excludes an unassigned team-backlog subtask', () => {
      expect(isSubtaskOwnedByUser({ assigneeUserId: null }, USER, true)).toBe(
        false,
      );
      expect(
        isSubtaskOwnedByUser({ assigneeUserId: undefined }, USER, true),
      ).toBe(false);
    });

    it('matches on user id only — never a name or email in another field', () => {
      // A row that "looks" like the user by name but is assigned to nobody by id
      // must not match: the rule reads assigneeUserId exclusively.
      const row = { assigneeUserId: null } as {
        assigneeUserId: string | null;
        assignee?: string;
      };
      row.assignee = USER; // free-text label — intentionally ignored
      expect(isSubtaskOwnedByUser(row, USER, true)).toBe(false);
    });
  });
});
