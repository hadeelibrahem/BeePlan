import {
  describeDatabaseError,
  isTransientDatabaseError,
  withTransientDatabaseRetry,
} from './database-error';

describe('describeDatabaseError', () => {
  it('classifies pool acquisition timeouts without exposing connection details', () => {
    expect(describeDatabaseError(new Error('timeout exceeded when trying to connect'), 'query')).toMatchObject({
      category: 'connection_pool_timeout',
      phase: 'before_acquiring_connection',
      timeout: true,
    });
  });

  it('keeps PostgreSQL query codes and execution phase', () => {
    expect(describeDatabaseError({ message: 'duplicate key', code: '23505' }, 'query')).toMatchObject({
      category: 'postgres_query_error',
      phase: 'query_execution',
      code: '23505',
      timeout: false,
      transient: false,
    });
  });

  it.each([
    [{ message: 'getaddrinfo ENOTFOUND pooler.example', code: 'ENOTFOUND' }, 'database_dns_error'],
    [new Error('Connection terminated unexpectedly'), 'database_connection_reset'],
    [new Error('Query read timeout'), 'database_query_read_timeout'],
    [{ message: 'server unavailable', code: '08006' }, 'postgres_connection_or_resource_error'],
  ])('classifies transient infrastructure failures', (error, category) => {
    expect(isTransientDatabaseError(error)).toBe(true);
    expect(describeDatabaseError(error, 'query')).toMatchObject({ category, transient: true });
  });

  it('retries a transient safe operation with bounded backoff', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce('recovered');
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(withTransientDatabaseRetry(operation, {
      attempts: 2,
      baseDelayMs: 25,
      sleep,
    })).resolves.toBe('recovered');

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(25);
  });

  it('does not retry programming or constraint errors', async () => {
    const operation = jest.fn().mockRejectedValue({ message: 'duplicate key', code: '23505' });

    await expect(withTransientDatabaseRetry(operation, { attempts: 3, sleep: jest.fn() }))
      .rejects.toMatchObject({ code: '23505' });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
