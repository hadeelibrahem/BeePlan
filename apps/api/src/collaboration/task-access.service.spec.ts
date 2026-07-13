import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../db/database.service';
import { taskMembers, tasks } from '../db/schema';
import { TaskAccessService } from './task-access.service';

const OWNER_ID = 'owner-1';
const EDITOR_ID = 'editor-1';
const VIEWER_ID = 'viewer-1';
const PENDING_ID = 'pending-1';
const OUTSIDER_ID = 'outsider-1';
const TASK_ID = 'task-1';

const taskRow = { id: TASK_ID, userId: OWNER_ID };

const memberRows = [
  { taskId: TASK_ID, userId: EDITOR_ID, role: 'editor', status: 'accepted' },
  { taskId: TASK_ID, userId: VIEWER_ID, role: 'viewer', status: 'accepted' },
  // A pending (not yet accepted) invite must not grant access.
  { taskId: TASK_ID, userId: PENDING_ID, role: 'editor', status: 'pending' },
];

function buildDb() {
  return {
    select: jest.fn(() => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(table === tasks ? [taskRow] : memberRows),
      }),
    })),
  };
}

describe('TaskAccessService', () => {
  let service: TaskAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAccessService,
        { provide: DatabaseService, useValue: { db: buildDb() } },
      ],
    }).compile();

    service = module.get<TaskAccessService>(TaskAccessService);
  });

  it('grants the owner full access regardless of minRole', async () => {
    await expect(
      service.require(OWNER_ID, TASK_ID, 'owner'),
    ).resolves.toMatchObject({ role: 'owner' });
  });

  it('lets an accepted editor pass an editor-level (write) check', async () => {
    await expect(
      service.require(EDITOR_ID, TASK_ID, 'editor'),
    ).resolves.toMatchObject({ role: 'editor' });
  });

  it('lets an accepted viewer pass a viewer-level (read-only) check', async () => {
    await expect(
      service.require(VIEWER_ID, TASK_ID, 'viewer'),
    ).resolves.toMatchObject({ role: 'viewer' });
  });

  it('rejects a viewer attempting an editor-level write with 403 Forbidden', async () => {
    await expect(
      service.require(VIEWER_ID, TASK_ID, 'editor'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a viewer attempting an owner-only action (e.g. delete) with 403 Forbidden', async () => {
    await expect(
      service.require(VIEWER_ID, TASK_ID, 'owner'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an editor attempting an owner-only action with 403 Forbidden', async () => {
    await expect(
      service.require(EDITOR_ID, TASK_ID, 'owner'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user whose invitation is still pending (404, not leaking task existence)', async () => {
    await expect(
      service.require(PENDING_ID, TASK_ID, 'viewer'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a user with no access at all with 404 (task existence not leaked)', async () => {
    await expect(
      service.require(OUTSIDER_ID, TASK_ID, 'viewer'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getRole returns null for a user with no access', async () => {
    await expect(service.getRole(OUTSIDER_ID, TASK_ID)).resolves.toBeNull();
  });

  it('getRecipientIds returns the owner plus every member (deduplicated)', async () => {
    await expect(service.getRecipientIds(TASK_ID)).resolves.toEqual(
      expect.arrayContaining([OWNER_ID, EDITOR_ID, VIEWER_ID]),
    );
  });
});
