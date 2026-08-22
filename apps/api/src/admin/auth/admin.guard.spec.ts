/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

const contextFor = (user?: { id: string }) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
describe('AdminGuard', () => {
  const findFirst = jest.fn();
  const guard = new AdminGuard({
    db: { query: { users: { findFirst } } },
  } as any);
  beforeEach(() => findFirst.mockReset());
  it('rejects an unauthenticated request', async () =>
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      ForbiddenException,
    ));
  it('rejects a normal user', async () => {
    findFirst.mockResolvedValue({ role: 'user', accountStatus: 'active' });
    await expect(
      guard.canActivate(contextFor({ id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('accepts an active admin from authoritative database state', async () => {
    findFirst.mockResolvedValue({ role: 'admin', accountStatus: 'active' });
    await expect(guard.canActivate(contextFor({ id: 'a1' }))).resolves.toBe(
      true,
    );
  });
  it('accepts an active super admin from authoritative database state', async () => {
    findFirst.mockResolvedValue({ role: 'super_admin', accountStatus: 'active' });
    await expect(guard.canActivate(contextFor({ id: 's1' }))).resolves.toBe(true);
  });
  it('rejects a suspended admin', async () => {
    findFirst.mockResolvedValue({ role: 'admin', accountStatus: 'suspended' });
    await expect(
      guard.canActivate(contextFor({ id: 'a1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
