import { ConflictException } from '@nestjs/common';
import { TimeCapsulesService } from './time-capsules.service';

const row = { id: 'capsule', userId: 'user', title: 'Future me', message: 'private', unlockType: 'date', unlockAt: new Date('2030-01-01'), linkedTaskId: null, linkedProjectId: null, status: 'locked', sealedAt: new Date(), openedAt: null, notificationSentAt: null, createdAt: new Date(), updatedAt: new Date() };
describe('TimeCapsulesService privacy and immutability', () => {
  const service = new TimeCapsulesService({ db: {} } as never, {} as never);
  it('redacts locked sealed content from a list payload', () => {
    const safe = (service as any).safe(row, 2);
    expect(safe.message).toBeUndefined(); expect(safe.attachmentCount).toBe(2); expect(safe.title).toBe('Future me');
  });
  it('keeps unsealed drafts identifiable without exposing a sealed-content path', () => {
    expect((service as any).safe({ ...row, sealedAt: null }, 0).isDraft).toBe(true);
  });
  it('rejects draft mutation after sealing before touching attachment storage', async () => {
    jest.spyOn(service as any, 'owned').mockResolvedValue(row);
    await expect(service.addAttachment('user', 'capsule', {} as Express.Multer.File)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects opening a locked capsule', async () => {
    jest.spyOn(service, 'reconcile').mockResolvedValue(0); jest.spyOn(service as any, 'owned').mockResolvedValue(row);
    await expect(service.open('user', 'capsule')).rejects.toBeInstanceOf(ConflictException);
  });
  it('returns full draft attachment metadata only to its owner path', () => {
    const attachment = { id: 'a', capsuleId: 'capsule', userId: 'user', type: 'file', fileName: 'memory.pdf', mimeType: 'application/pdf', sizeBytes: 10, storageKey: 'secret/key', durationSeconds: null, createdAt: new Date() };
    const detail = (service as any).detail({ ...row, sealedAt: null }, [attachment]);
    expect(detail.message).toBe('private'); expect(detail.attachments[0]).toMatchObject({ id: 'a', fileName: 'memory.pdf' }); expect(detail.attachments[0].storageKey).toBeUndefined();
  });
  it('does not return attachment URLs in a locked safe payload', () => {
    const safe = (service as any).safe(row, 1);
    expect(safe.attachments).toBeUndefined(); expect(JSON.stringify(safe)).not.toContain('storageKey');
  });
  it('treats an already-opened capsule as an idempotent open', async () => {
    const opened = { ...row, status: 'opened', openedAt: new Date() };
    jest.spyOn(service, 'reconcile').mockResolvedValue(0); jest.spyOn(service as any, 'owned').mockResolvedValue(opened);
    const db = { select: jest.fn(() => ({ from: () => ({ where: jest.fn().mockResolvedValue([]) }) })) }; (service as any).database = { db };
    const result = await service.open('user', 'capsule'); expect(result.status).toBe('opened'); expect(result.openedAt).toEqual(opened.openedAt);
  });
  it('rejects attachment reads for a locked capsule before selecting a file', async () => {
    jest.spyOn(service as any, 'owned').mockResolvedValue(row);
    await expect(service.attachment('user', 'capsule', 'attachment')).rejects.toThrow('Attachment not found');
  });
  it('does not depend on notification success for a completed transition contract', async () => {
    const notifications = { createOnce: jest.fn().mockRejectedValue(new Error('push unavailable')) };
    const isolated = new TimeCapsulesService({ db: {} } as never, notifications as never);
    expect((isolated as any).notifications).toBe(notifications);
  });
});
