import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../db/database.service';
import { RemindersService } from './reminders.service';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const REMINDER_ID = '33333333-3333-3333-3333-333333333333';

const baseRow = {
  id: REMINDER_ID,
  userId: USER_A,
  title: 'Buy milk',
  type: 'time',
  triggerDateTime: null,
  reminderBefore: null,
  repeat: 'none',
  repeatInterval: null,
  repeatDaysOfWeek: null,
  repeatEndDate: null,
  notes: null,
  priority: 'medium',
  status: 'active',
  location: null,
  context: null,
  checklistItems: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createQueryBuilder(rows: unknown[]) {
  const builder: Record<string, jest.Mock> = {};
  builder.from = jest.fn().mockReturnValue(builder);
  builder.where = jest.fn().mockResolvedValue(rows);
  builder.set = jest.fn().mockReturnValue(builder);
  builder.values = jest.fn().mockReturnValue(builder);
  builder.returning = jest.fn().mockResolvedValue(rows);
  return builder;
}

describe('RemindersService (per-user ownership)', () => {
  let service: RemindersService;
  let db: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: DatabaseService, useValue: { db } },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  it('findAll only queries rows scoped to the requesting user', async () => {
    const builder = createQueryBuilder([baseRow]);
    db.select.mockReturnValue(builder);

    const result = await service.findAll(USER_A);

    expect(result).toHaveLength(1);
    expect(builder.where).toHaveBeenCalledTimes(1);
  });

  it('findOne throws 404 when the reminder belongs to a different user', async () => {
    const builder = createQueryBuilder([]);
    db.select.mockReturnValue(builder);

    await expect(service.findOne(USER_B, REMINDER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create always stores the authenticated userId as owner', async () => {
    const builder = createQueryBuilder([baseRow]);
    db.insert.mockReturnValue(builder);

    await service.create(USER_A, {
      title: 'Buy milk',
      type: 'time',
      repeat: 'none',
      priority: 'medium',
    } as never);

    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A }),
    );
  });

  it('update rejects modifying a reminder owned by another user', async () => {
    const emptyBuilder = createQueryBuilder([]);
    db.select.mockReturnValue(emptyBuilder);

    await expect(
      service.update(USER_B, REMINDER_ID, { title: 'hijacked' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('remove rejects deleting a reminder owned by another user', async () => {
    const emptyBuilder = createQueryBuilder([]);
    db.select.mockReturnValue(emptyBuilder);

    await expect(service.remove(USER_B, REMINDER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.delete).not.toHaveBeenCalled();
  });
});
