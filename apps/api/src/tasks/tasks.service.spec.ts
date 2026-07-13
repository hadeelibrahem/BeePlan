import { ConflictException, ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { TaskAccessService } from '../collaboration/task-access.service'
import { DatabaseService } from '../db/database.service'
import { NotificationsService } from '../notifications/notifications.service'
import { TasksService } from './tasks.service'

const USER_ID = '11111111-1111-1111-1111-111111111111'
const TASK_ID = '22222222-2222-2222-2222-222222222222'

const baseTask = {
  id: TASK_ID,
  userId: USER_ID,
  title: 'Ship release',
  description: null,
  priority: 'medium',
  status: 'todo',
  progress: 0,
  dueDate: null,
  dueTime: null,
  category: null,
  notes: null,
  estimatedTimeMinutes: 0,
  spentTimeMinutes: 0,
  remainingTimeMinutes: 0,
  reminderEnabled: false,
  reminderBeforeMinutes: null,
  labels: null,
  attachments: null,
  isFavorite: false,
  isFocusTask: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createUpdateBuilder() {
  const builder: Record<string, jest.Mock> = {}
  builder.set = jest.fn().mockReturnValue(builder)
  builder.where = jest.fn().mockResolvedValue(undefined)
  return builder
}

describe('TasksService.changeStatus', () => {
  let service: TasksService
  let db: {
    select: jest.Mock
    insert: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    query: Record<string, unknown>
  }

  beforeEach(async () => {
    db = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      query: {},
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: DatabaseService, useValue: { db } },
        // Personal-task tests only: the task is owner-only, so access always
        // resolves to owner and the recipient list is just the owner (which
        // makes member notification fan-out a no-op).
        {
          provide: TaskAccessService,
          useValue: {
            require: jest
              .fn()
              .mockResolvedValue({ task: baseTask, role: 'owner', isShared: false }),
            getRecipientIds: jest.fn().mockResolvedValue([USER_ID]),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), createMany: jest.fn() },
        },
      ],
    }).compile()

    service = module.get<TasksService>(TasksService)

    jest.spyOn(service as any, 'recalculateProgress').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'addActivity').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      ...baseTask,
      status: 'in_progress',
      progress: 50,
    })
    jest.spyOn(service as any, 'assertDependenciesComplete').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'assertSubtasksComplete').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'getTaskForUser').mockResolvedValue(baseTask)
  })

  it('updates tasks.status in the database and returns the refreshed task', async () => {
    const updateBuilder = createUpdateBuilder()
    db.update.mockReturnValue(updateBuilder)

    const result = await service.changeStatus(USER_ID, TASK_ID, {
      status: 'in_progress',
      progress: 50,
    })

    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_progress',
        updatedAt: expect.any(Date),
      }),
    )
    expect(result).toMatchObject({
      id: TASK_ID,
      status: 'in_progress',
      progress: 50,
    })
  })

  it('blocks done status when subtasks are incomplete', async () => {
    jest.spyOn(service as any, 'assertSubtasksComplete').mockRejectedValueOnce(
      new ConflictException('Complete all subtasks before marking this task as Done.'),
    )

    await expect(service.changeStatus(USER_ID, TASK_ID, { status: 'done' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })
})

// --- Subtask visibility + write guard ---------------------------------------

const EDITOR_ID = '33333333-3333-3333-3333-333333333333'
const OTHER_ID = '44444444-4444-4444-4444-444444444444'

function subRow(id: string, assigneeUserId: string | null, isShared = false) {
  return {
    id,
    taskId: TASK_ID,
    title: id,
    isDone: false,
    orderIndex: 0,
    assignee: null,
    assigneeUserId,
    isShared,
    description: null,
    priority: 'medium',
    status: 'todo',
    startDate: null,
    dueDate: null,
    estimatedDurationMinutes: null,
    actualDurationMinutes: null,
    estimatedDurationSource: 'user',
    reminderEnabled: false,
    reminderMinutesBeforeDue: null,
    reminderTime: null,
    reminderSentAt: null,
    reminderStatus: 'none',
    notes: null,
    tags: null,
    dependencyIds: [],
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

// A drizzle select double whose `.where()` is both awaitable (getSubtaskForTask)
// and chainable to `.orderBy()` (listSubtasks), resolving to the given rows.
function selectReturning(rows: unknown[]) {
  return jest.fn(() => ({
    from: () => ({
      where: () => {
        const p: Promise<unknown[]> & { orderBy?: () => Promise<unknown[]> } =
          Promise.resolve(rows)
        p.orderBy = () => Promise.resolve(rows)
        return p
      },
    }),
  }))
}

function buildService(role: 'owner' | 'editor' | 'viewer', db: unknown) {
  const service = new TasksService(
    { db } as unknown as DatabaseService,
    {
      require: jest.fn().mockResolvedValue({
        task: { ...baseTask, userId: role === 'owner' ? EDITOR_ID : USER_ID },
        role,
        isShared: true,
      }),
    } as unknown as TaskAccessService,
    { create: jest.fn(), createMany: jest.fn() } as unknown as NotificationsService,
  )
  return service
}

describe('TasksService.listSubtasks visibility', () => {
  const rows = [
    subRow('mine', EDITOR_ID),
    subRow('others', OTHER_ID),
    subRow('shared', null, true),
    subRow('unassigned', null),
  ]

  it("hides another member's personal subtask from an editor", async () => {
    const db = { select: selectReturning(rows) }
    const service = buildService('editor', db)

    const result = await service.listSubtasks(EDITOR_ID, TASK_ID)
    expect(result.map((r) => r.id).sort()).toEqual(
      ['mine', 'shared', 'unassigned'].sort(),
    )
  })

  it('lets the owner see all subtasks', async () => {
    const db = { select: selectReturning(rows) }
    const service = buildService('owner', db)

    const result = await service.listSubtasks(EDITOR_ID, TASK_ID)
    expect(result).toHaveLength(4)
  })

  it('enforces the by-member filter server-side for the owner', async () => {
    const db = { select: selectReturning(rows) }
    const service = buildService('owner', db)

    const result = await service.listSubtasks(EDITOR_ID, TASK_ID, {
      view: 'member',
      assigneeId: OTHER_ID,
    })
    expect(result.map((r) => r.id)).toEqual(['others'])
  })
})

describe('TasksService.updateSubtask write guard', () => {
  it("forbids an editor from editing another member's personal subtask", async () => {
    const db = { select: selectReturning([subRow('x', OTHER_ID)]) }
    const service = buildService('editor', db)

    await expect(
      service.updateSubtask(EDITOR_ID, TASK_ID, 'x', { title: 'hack' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})

