import { validateEnv } from './env';

describe('database environment configuration', () => {
  const required = {
    JWT_SECRET: 'a-development-secret-that-is-long-enough',
  };

  it('uses persistent-backend pool defaults', () => {
    const env = validateEnv(required);

    expect(env).toMatchObject({
      DB_SSL: false,
      DB_KEEP_ALIVE: true,
      DB_KEEP_ALIVE_INITIAL_DELAY_MS: 10_000,
      DB_POOL_MIN: 1,
      DB_POOL_MAX: 10,
      DB_CONNECTION_TIMEOUT_MS: 10_000,
      DB_IDLE_TIMEOUT_MS: 300_000,
      DB_QUERY_TIMEOUT_MS: 15_000,
      DB_APPLICATION_NAME: 'beeplan-api',
    });
  });

  it('parses false boolean strings as false', () => {
    const env = validateEnv({
      ...required,
      DB_SSL: 'false',
      DB_KEEP_ALIVE: 'false',
    });

    expect(env.DB_SSL).toBe(false);
    expect(env.DB_KEEP_ALIVE).toBe(false);
  });
});
