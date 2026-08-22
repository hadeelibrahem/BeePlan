import { ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

const contextFor = (user?: { id: string }) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
describe('SuperAdminGuard', () => {
  const findFirst = jest.fn();
  const guard = new SuperAdminGuard({ db: { query: { users: { findFirst } } } } as any);
  beforeEach(() => findFirst.mockReset());
  it('rejects a normal admin', async () => { findFirst.mockResolvedValue({ role: 'admin', accountStatus: 'active' }); await expect(guard.canActivate(contextFor({ id: 'a1' }))).rejects.toBeInstanceOf(ForbiddenException); });
  it('accepts an active super admin', async () => { findFirst.mockResolvedValue({ role: 'super_admin', accountStatus: 'active' }); await expect(guard.canActivate(contextFor({ id: 's1' }))).resolves.toBe(true); });
});
