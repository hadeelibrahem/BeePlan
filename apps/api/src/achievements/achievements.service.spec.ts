import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DatabaseService } from '../db/database.service'
import { AchievementsService } from './achievements.service'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const ID = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-444444444444'
const row = (overrides = {}) => ({ id: ID, userId: USER, title: 'Graduated', description: null, reflection: null, achievementDate: '2026-05-24', category: 'Education', relatedTaskId: null, createdAt: new Date(), updatedAt: new Date(), ...overrides })

describe('AchievementsService', () => {
  let service: AchievementsService
  let db: any
  const select = (result: unknown[]) => { const builder: any = {}; builder.from = jest.fn().mockReturnValue(builder); builder.where = jest.fn().mockReturnValue(builder); builder.orderBy = jest.fn().mockReturnValue(builder); builder.limit = jest.fn().mockReturnValue(builder); builder.then = (resolve: (value: unknown[]) => unknown) => resolve(result); return builder }
  beforeEach(async () => { db = { select: jest.fn(() => select([])), insert: jest.fn(), update: jest.fn(), delete: jest.fn() }; const module = await Test.createTestingModule({ providers: [AchievementsService, { provide: DatabaseService, useValue: { db } }] }).compile(); service = module.get(AchievementsService) })

  it('creates and retrieves an achievement owned by the caller', async () => {
    const created = row(); const insert = { values: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([created]) }; db.insert.mockReturnValue(insert); db.select.mockReturnValueOnce(select([]))
    await expect(service.create(USER, { title: 'Graduated', achievementDate: '2026-05-24', category: 'Education' })).resolves.toEqual(expect.objectContaining({ id: ID, title: 'Graduated' }))
    db.select.mockReturnValueOnce(select([created])).mockReturnValueOnce(select([])); await expect(service.get(USER, ID)).resolves.toEqual(expect.objectContaining({ id: ID }))
  })

  it('rejects reads, edits and deletes for another owner', async () => {
    db.select.mockReturnValue(select([])); await expect(service.get(OTHER, ID)).rejects.toBeInstanceOf(NotFoundException); await expect(service.update(OTHER, ID, { title: 'Nope' })).rejects.toBeInstanceOf(NotFoundException); await expect(service.remove(OTHER, ID)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('filters by category, year, and title through the scoped query', async () => {
    const builder = select([]); db.select.mockReturnValue(builder); await service.list(USER, { category: 'Education', year: 2026, search: 'grad' }); expect(builder.where).toHaveBeenCalled(); expect(builder.orderBy).toHaveBeenCalled()
  })

  it('rejects duplicate related tasks before creating a second achievement', async () => {
    db.select.mockReturnValueOnce(select([{ id: TASK, userId: USER }])).mockReturnValueOnce(select([{ id: ID }]))
    const insert = { values: jest.fn(), returning: jest.fn() }; db.insert.mockReturnValue(insert)
    await expect(service.create(USER, { title: 'Again', achievementDate: '2026-05-24', category: 'Milestone', relatedTaskId: TASK })).rejects.toBeInstanceOf(BadRequestException); expect(db.insert).not.toHaveBeenCalled()
  })

  it('deletes only the achievement and keeps a related task untouched', async () => {
    db.select.mockReturnValueOnce(select([row({ relatedTaskId: TASK })])).mockReturnValueOnce(select([])); const deletion = { where: jest.fn().mockResolvedValue(undefined) }; db.delete.mockReturnValue(deletion); await service.remove(USER, ID); expect(db.delete).toHaveBeenCalled(); expect(deletion.where).toHaveBeenCalled()
  })

  it('rejects non-owned image operations before touching storage or image rows', async () => {
    db.select.mockReturnValue(select([])); await expect(service.uploadImage(OTHER, ID, undefined)).rejects.toBeInstanceOf(NotFoundException); await expect(service.removeImage(OTHER, ID, ID)).rejects.toBeInstanceOf(NotFoundException); await expect(service.setCover(OTHER, ID, ID)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('builds a user-scoped year review with real linked-task aggregates', async () => {
    const achievement = row({ relatedTaskId: TASK }); const task = { id: TASK, userId: USER, status: 'done' };
    db.select
      .mockReturnValueOnce(select([achievement]))
      .mockReturnValueOnce(select([achievement]))
      .mockReturnValueOnce(select([]))
      .mockReturnValueOnce(select([task]))
      .mockReturnValueOnce(select([{ count: 2 }]))
      .mockReturnValueOnce(select([{ sessions: 1, minutes: 45 }]))
      .mockReturnValueOnce(select([{ count: 0 }]))
      .mockReturnValueOnce(select([task]))
      .mockReturnValueOnce(select([{ sessions: 1, minutes: 45 }]));
    await expect(service.yearReview(USER, 2026)).resolves.toEqual(expect.objectContaining({ year: 2026, stats: expect.objectContaining({ achievements: 1, memories: 0, completedLinkedTasks: 1, focusSessions: 1, focusedMinutes: 45 }), availableYears: [2026] }));
  })

  it('rejects an invalid review year before querying data', async () => {
    await expect(service.yearReview(USER, 0)).rejects.toBeInstanceOf(BadRequestException); expect(db.select).not.toHaveBeenCalled()
  })
})
