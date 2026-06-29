import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../db/database.service';
import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  let service: RemindersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RemindersService, { provide: DatabaseService, useValue: {} }],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
