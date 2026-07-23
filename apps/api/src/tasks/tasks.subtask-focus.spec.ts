import { TasksService } from './tasks.service';
import type { SubtaskDto } from './dto/task-shared.dto';

// These tests exercise the pure subtask mapping helpers directly (no DB): the
// DTO -> insert row mapping and the row -> API entity mapping. The service's
// other collaborators are irrelevant here, so we construct it with bare stubs
// and reach the private mappers via bracket access.
function makeService(): TasksService {
  return new TasksService(
    { db: {} } as never,
    {} as never,
    {} as never,
  );
}

type InsertMapper = (
  taskId: string,
  dto: SubtaskDto,
  index: number,
) => { isFocusTask: boolean };
type EntityMapper = (row: unknown, deps?: string[]) => { isFocusTask: boolean };

const TASK_ID = '22222222-2222-2222-2222-222222222222';

function baseRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '33333333-3333-3333-3333-333333333333',
    taskId: TASK_ID,
    title: 'Review Chapter 1',
    isDone: false,
    orderIndex: 0,
    assignee: null,
    assigneeUserId: null,
    isShared: false,
    isFocusTask: false,
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
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Subtask isFocusTask mapping', () => {
  let service: TasksService;
  let toSubtaskInsert: InsertMapper;
  let toSubtaskEntity: EntityMapper;

  beforeEach(() => {
    service = makeService();
    toSubtaskInsert = (
      service as unknown as { toSubtaskInsert: InsertMapper }
    ).toSubtaskInsert.bind(service);
    toSubtaskEntity = (
      service as unknown as { toSubtaskEntity: EntityMapper }
    ).toSubtaskEntity.bind(service);
  });

  it('persists an explicit focus flag on create', () => {
    const row = toSubtaskInsert(
      TASK_ID,
      { title: 'Review Chapter 1', isFocusTask: true } as SubtaskDto,
      0,
    );
    expect(row.isFocusTask).toBe(true);
  });

  it('defaults isFocusTask to false when omitted on create', () => {
    const row = toSubtaskInsert(
      TASK_ID,
      { title: 'Review Chapter 1' } as SubtaskDto,
      0,
    );
    expect(row.isFocusTask).toBe(false);
  });

  it('maps the stored focus flag into the API response', () => {
    expect(toSubtaskEntity(baseRow({ isFocusTask: true })).isFocusTask).toBe(
      true,
    );
    expect(toSubtaskEntity(baseRow({ isFocusTask: false })).isFocusTask).toBe(
      false,
    );
  });
});
