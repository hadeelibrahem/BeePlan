import { ErrorSanitizerService } from './error-sanitizer.service';
describe('ErrorSanitizerService', () => {
  it('removes nested secrets before data can be persisted', () => {
    const sanitized = new ErrorSanitizerService().sanitize({ user: { email: 'safe@example.com', password: 'secret' }, headers: { authorization: 'Bearer SECRET' }, provider: { apiKey: 'SECRET' }, accessToken: 'nope' }) as Record<string, unknown>;
    expect(sanitized).toEqual({ user: { email: 'safe@example.com' }, headers: {}, provider: {} });
    expect(JSON.stringify(sanitized)).not.toContain('SECRET');
  });
  it('bounds oversized metadata', () => expect((new ErrorSanitizerService().sanitize('x'.repeat(3000)) as string)).toHaveLength(2000));
  it('redacts secret-like strings and stack evidence', () => {
    const sanitizer = new ErrorSanitizerService();
    expect(sanitizer.stack('Error authorization=Bearer SECRET apiKey=SECRET')).not.toContain('SECRET');
  });
});
