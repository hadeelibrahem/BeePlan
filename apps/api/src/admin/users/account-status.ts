import type { users } from '../../db/schema';

export function accountStatusUpdate(target: typeof users.$inferSelect, status: 'active' | 'suspended', reason: string | undefined, now = new Date()) {
  return status === 'suspended'
    ? { accountStatus: 'suspended' as const, suspendedAt: now, suspensionReason: reason?.trim() || null, tokenVersion: target.tokenVersion + 1, updatedAt: now }
    : { accountStatus: 'active' as const, suspendedAt: null, suspensionReason: null, tokenVersion: target.tokenVersion + 1, updatedAt: now };
}
