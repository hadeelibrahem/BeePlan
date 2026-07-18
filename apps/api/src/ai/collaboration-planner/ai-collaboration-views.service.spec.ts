import { subtasks, tasks, users } from '../../db/schema';
import { AiCollaborationViewsService } from './ai-collaboration-views.service';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const EDITOR_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';

type AnyRow = Record<string, unknown>;

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    where: () => chain(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

function makeService(config: {
  usersList: AnyRow[];
  tasksList: AnyRow[];
  subtasksList: AnyRow[];
  memberIds: string[];
}) {
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === users) return chain(config.usersList);
        if (table === tasks) return chain(config.tasksList);
        if (table === subtasks) return chain(config.subtasksList);
        return chain([]);
      },
    }),
  };
  const databaseService = { db } as any;
  const access = { getRecipientIds: async () => config.memberIds } as any;
  return new AiCollaborationViewsService(databaseService, access);
}

describe('AiCollaborationViewsService', () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  describe('getToday', () => {
    it('groups open, started items by assignee and leaves untouched members empty', async () => {
      const service = makeService({
        usersList: [
          { id: OWNER_ID, fullName: 'Owner' },
          { id: EDITOR_ID, fullName: 'Editor' },
        ],
        tasksList: [{ title: 'Biology Project' }],
        subtasksList: [
          {
            id: 'a',
            title: 'Review notes',
            status: 'todo',
            startDate: yesterday,
            dueDate: now,
            assigneeUserId: OWNER_ID,
            isShared: false,
          },
        ],
        memberIds: [OWNER_ID, EDITOR_ID],
      });

      const plan = await service.getToday(TASK_ID);
      const owner = plan.members.find((m) => m.userId === OWNER_ID)!;
      const editor = plan.members.find((m) => m.userId === EDITOR_ID)!;
      expect(owner.items).toHaveLength(1);
      expect(editor.items).toHaveLength(0);
    });

    it('falls back to the task title when nothing is due today', async () => {
      const service = makeService({
        usersList: [{ id: OWNER_ID, fullName: 'Owner' }],
        tasksList: [{ title: 'Biology Project' }],
        subtasksList: [],
        memberIds: [OWNER_ID],
      });

      const plan = await service.getToday(TASK_ID);
      expect(plan.goal).toBe('Biology Project');
    });
  });

  describe('getProgress', () => {
    it('computes per-member and overall completion, excluding shared/unassigned from member buckets', async () => {
      const service = makeService({
        usersList: [{ id: OWNER_ID, fullName: 'Owner' }],
        tasksList: [],
        subtasksList: [
          { assigneeUserId: OWNER_ID, isShared: false, status: 'done' },
          { assigneeUserId: OWNER_ID, isShared: false, status: 'todo' },
          { assigneeUserId: null, isShared: true, status: 'done' },
        ],
        memberIds: [],
      });

      const progress = await service.getProgress(TASK_ID);
      expect(progress.totalCount).toBe(3);
      expect(progress.completedCount).toBe(2);
      expect(progress.overallPercent).toBe(67);
      expect(progress.members).toEqual([
        { userId: OWNER_ID, displayName: 'Owner', completedCount: 1, totalCount: 2, percent: 50 },
      ]);
    });
  });

  describe('getTimeline', () => {
    it('dedupes milestones by day and finds a free buffer day before the deadline', async () => {
      const deadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const service = makeService({
        usersList: [],
        tasksList: [{ dueDate: deadline }],
        subtasksList: [
          { id: 'a', title: 'Subject 1', dueDate: tomorrow },
          { id: 'b', title: 'Subject 1 extra', dueDate: tomorrow },
        ],
        memberIds: [],
      });

      const timeline = await service.getTimeline(TASK_ID);
      expect(timeline.milestones).toHaveLength(1);
      expect(timeline.deadline).toBe(deadline.toISOString());
      expect(timeline.bufferDay).not.toBeNull();
    });
  });
});
