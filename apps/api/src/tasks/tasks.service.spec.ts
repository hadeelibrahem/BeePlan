import { ConflictException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { DatabaseService } from '../db/database.service'
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
      providers: [TasksService, { provide: DatabaseService, useValue: { db } }],
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

