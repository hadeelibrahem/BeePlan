import { ErrorFingerprintService } from './error-fingerprint.service';
describe('ErrorFingerprintService', () => {
  const service = new ErrorFingerprintService();
  it('groups dynamic ids into one fingerprint', () => {
    const base = { environment: 'test', service: 'api', route: '/tasks', errorClass: 'Error', stack: 'Error at task.ts:12' };
    expect(service.fingerprint({ ...base, message: 'User 550e8400-e29b-41d4-a716-446655440000 failed task 928173' })).toBe(service.fingerprint({ ...base, message: 'User 660e8400-e29b-41d4-a716-446655440000 failed task 123456' }));
  });
  it('does not merge separate routes', () => {
    const base = { environment: 'test', service: 'api', errorClass: 'Error', message: 'failed' };
    expect(service.fingerprint({ ...base, route: '/tasks' })).not.toBe(service.fingerprint({ ...base, route: '/notes' }));
  });
});
