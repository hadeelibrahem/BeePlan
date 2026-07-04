import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './db/database.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: {
            healthCheck: jest
              .fn()
              .mockResolvedValue({ ok: true, latencyMs: 1 }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API health metadata', () => {
      expect(appController.getHello()).toMatchObject({
        ok: true,
        service: 'BeePlan API',
      });
      expect(appController.getHello().timestamp).toEqual(expect.any(String));
    });
  });
});
