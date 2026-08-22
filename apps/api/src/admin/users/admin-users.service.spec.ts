import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

const user = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  fullName: 'Existing User',
  username: 'existing',
  email: 'existing@example.com',
  role: 'user',
  accountStatus: 'active',
  tokenVersion: 3,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

function serviceFor(target: Record<string, unknown> | undefined) {
  const updated = target && {
    ...target,
    role: 'admin',
    tokenVersion: Number(target.tokenVersion) + 1,
  };
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => (target ? [target] : [])),
        })),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => (updated ? [updated] : [])),
        })),
      })),
    })),
  };
  const database = {
    db: {
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    },
  };
  const audit = { write: jest.fn(async () => undefined) };
  return {
    service: new AdminUsersService(
      database as never,
      audit as never,
      {} as never,
    ),
    audit,
  };
}

describe('AdminUsersService.promoteUser', () => {
  it('promotes the existing identity, increments tokenVersion, and audits safely', async () => {
    const target = user();
    const { service, audit } = serviceFor(target);
    const result = await service.promoteUser('super-1', 'user-1');
    expect(result).toMatchObject({
      id: 'user-1',
      email: target.email,
      username: target.username,
      role: 'admin',
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user_promoted',
        actorUserId: 'super-1',
        targetId: 'user-1',
        beforeState: { role: 'user' },
        afterState: { role: 'admin' },
      }),
      expect.anything(),
    );
  });

  it('rejects missing, non-user, and suspended targets', async () => {
    await expect(
      serviceFor(undefined).service.promoteUser('super-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      serviceFor(user({ role: 'admin' })).service.promoteUser(
        'super-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      serviceFor(user({ role: 'super_admin' })).service.promoteUser(
        'super-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      serviceFor(user({ accountStatus: 'suspended' })).service.promoteUser(
        'super-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
