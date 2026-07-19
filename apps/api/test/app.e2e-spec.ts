import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/db/database.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The public health endpoints below do not query the database. Avoid
      // running DatabaseService's production schema-repair startup work here;
      // database behavior is covered by the database-backed service tests.
      .overrideProvider(DatabaseService)
      .useValue({
        healthCheck: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) exposes the API identity without requiring infrastructure', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    const body = response.body as { timestamp: string };

    expect(body).toMatchObject({
      ok: true,
      service: 'BeePlan API',
    });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('/health (GET) remains available without a database probe', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      service: 'BeePlan API',
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
