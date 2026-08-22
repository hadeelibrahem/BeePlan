import { accountStatusUpdate } from './account-status';

describe('accountStatusUpdate', () => {
  const target = { tokenVersion: 4 } as any;
  const now = new Date('2026-08-12T12:00:00.000Z');

  it('suspends and records the reason while incrementing tokenVersion', () => {
    expect(accountStatusUpdate(target, 'suspended', 'policy violation', now)).toEqual({ accountStatus: 'suspended', suspendedAt: now, suspensionReason: 'policy violation', tokenVersion: 5, updatedAt: now });
  });

  it('restores and clears suspension fields while incrementing tokenVersion', () => {
    expect(accountStatusUpdate(target, 'active', 'reviewed and reversed', now)).toEqual({ accountStatus: 'active', suspendedAt: null, suspensionReason: null, tokenVersion: 5, updatedAt: now });
  });
});
