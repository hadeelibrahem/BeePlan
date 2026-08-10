import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  RequestMethod,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FocusRoomsController } from './focus-rooms.controller';
import { FocusRoomsService } from './focus-rooms.service';

describe('FocusRoomsController invitations', () => {
  it('registers the canonical current-user invitation route', () => {
    const handler = FocusRoomsController.prototype.invitations;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'invitations/mine',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('returns an empty list and scopes lookup to the authenticated user', async () => {
    const invitations = jest.fn().mockResolvedValue([]);
    const controller = new FocusRoomsController({
      invitations,
    } as unknown as FocusRoomsService);
    const request = { user: { id: 'current-user' } } as AuthenticatedRequest;

    await expect(controller.invitations(request)).resolves.toEqual([]);
    expect(invitations).toHaveBeenCalledWith('current-user');
    expect(invitations).toHaveBeenCalledTimes(1);
  });
});

describe('FocusRoomsController HTTP registration', () => {
  let app: INestApplication;
  const rooms = {
    discover: jest.fn(),
    create: jest.fn(),
    invitations: jest.fn(),
  };
  const authenticatedGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      if (req.headers.authorization !== 'Bearer valid-token') {
        throw new UnauthorizedException('Please sign in to continue.');
      }
      req.user = { id: 'current-user' };
      return true;
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FocusRoomsController],
      providers: [{ provide: FocusRoomsService, useValue: rooms }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticatedGuard)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and [] for an authenticated empty room list', async () => {
    rooms.discover.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/focus-rooms')
      .set('Authorization', 'Bearer valid-token')
      .expect(200, []);

    expect(rooms.discover).toHaveBeenCalledWith('current-user');
  });

  it('registers POST /focus-rooms and returns 201 for creation', async () => {
    const created = { id: 'room-1', title: 'Quiet room' };
    rooms.create.mockResolvedValueOnce(created);

    await request(app.getHttpServer())
      .post('/focus-rooms')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Quiet room', mode: 'commitment', visibility: 'public' })
      .expect(201, created);

    expect(rooms.create).toHaveBeenCalledWith(
      'current-user',
      expect.objectContaining({ title: 'Quiet room' }),
    );
  });

  it('returns 200 and [] for an authenticated empty invitation list', async () => {
    rooms.invitations.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/focus-rooms/invitations/mine')
      .set('Authorization', 'Bearer valid-token')
      .expect(200, []);

    expect(rooms.invitations).toHaveBeenCalledWith('current-user');
  });

  it.each([
    ['get', '/focus-rooms'],
    ['post', '/focus-rooms'],
    ['get', '/focus-rooms/invitations/mine'],
  ] as const)('rejects unauthenticated %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });
});
