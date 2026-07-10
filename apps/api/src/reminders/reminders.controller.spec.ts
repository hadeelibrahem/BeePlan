import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseService } from '../db/database.service';
import { LocationSharingService } from '../social/location-sharing.service';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

describe('RemindersController', () => {
  let controller: RemindersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemindersController],
      providers: [
        RemindersService,
        JwtAuthGuard,
        { provide: DatabaseService, useValue: {} },
        { provide: JwtService, useValue: {} },
        {
          provide: LocationSharingService,
          useValue: { getViewerPermissionStatuses: jest.fn().mockResolvedValue(new Map()) },
        },
      ],
    }).compile();

    controller = module.get<RemindersController>(RemindersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
