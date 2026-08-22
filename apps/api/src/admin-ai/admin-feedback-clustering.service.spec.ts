import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AdminFeedbackClusteringService } from './admin-feedback-clustering.service';
import { feedbackClusterMembers, feedbackClusters, feedbackItems, feedbackVotes } from '../db/schema';
import { buildFeedbackClusteringContext } from './feedback-clustering.context';

const rows = [
  { item: { id: 'a', title: 'A', description: 'private description A', category: 'idea', status: 'submitted' }, voteCount: 2 },
  { item: { id: 'b', title: 'B', description: 'private description B', category: 'idea', status: 'reviewing' }, voteCount: 3 },
  { item: { id: 'c', title: 'C', description: 'private description C', category: 'idea', status: 'planned' }, voteCount: 5 },
];
const output = { clusters: [{ title: 'Theme', summary: 'Summary', feedbackIds: ['a', 'b'], confidence: 'high' as const }], unclusteredFeedbackIds: ['c'] };

function chain(result: unknown) { const value: any = { from: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(), leftJoin: jest.fn() }; value.from.mockReturnValue(value); value.where.mockReturnValue(value); value.orderBy.mockReturnValue(value); value.leftJoin.mockReturnValue(value); value.limit.mockResolvedValue(result); return value; }
function serviceWith(db: any, audit = { write: jest.fn().mockResolvedValue(undefined) }) {
  return { service: new AdminFeedbackClusteringService({ db } as never, new ConfigService({ QWEN_API_KEY: 'key', QWEN_BASE_URL: 'https://example.test', ADMIN_FEEDBACK_CLUSTERING_MODEL: 'model' }), audit as never), audit };
}

function persistenceDb(active: Array<{ id: string; feedbackId: string | null }>, fail = false) {
  const log: string[] = []; const writes: Array<{ table: unknown; values?: unknown; set?: unknown }> = [];
  const tx: any = {
    insert: jest.fn((table) => ({ values: jest.fn((values) => { log.push('insert'); writes.push({ table, values }); return { returning: jest.fn().mockResolvedValue([{ id: table === feedbackClusters ? 'new' : 'run' }]) }; }) })),
    update: jest.fn((table) => ({ set: jest.fn((set) => { log.push('update'); writes.push({ table, set }); return { where: jest.fn().mockResolvedValue(undefined) }; }) })),
    delete: jest.fn((table) => ({ where: jest.fn().mockImplementation(async () => { log.push('delete'); writes.push({ table }); if (fail) throw new Error('rollback'); }) })),
  };
  const db: any = { select: jest.fn(() => ({ from: jest.fn(() => ({ leftJoin: jest.fn(() => ({ where: jest.fn().mockResolvedValue(active) })) })) })), transaction: jest.fn(async (callback) => callback(tx)) };
  return { db, tx, log, writes };
}

describe('AdminFeedbackClusteringService decision flow', () => {
  it('calls the provider for a changed context and writes minimized audit metadata', async () => {
    const db = { select: jest.fn(() => chain([])) }; const { service, audit } = serviceWith(db);
    jest.spyOn(service as any, 'eligible').mockResolvedValue(rows); jest.spyOn(service as any, 'provider').mockResolvedValue(output); jest.spyOn(service as any, 'persist').mockResolvedValue({ id: 'run-1' }); jest.spyOn(service as any, 'list').mockResolvedValue([]);
    await service.analyze('admin');
    expect((service as any).provider).toHaveBeenCalledTimes(1); expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ inputCount: 3, outputClusterCount: 1 }) }));
    expect(JSON.stringify(audit.write.mock.calls[0][0])).not.toContain('private description');
  });
  it('reuses an identical context without calling the provider', async () => {
    const db = { select: jest.fn(() => chain([{ id: 'prior-run' }])) }; const { service } = serviceWith(db);
    jest.spyOn(service as any, 'eligible').mockResolvedValue(rows); jest.spyOn(service as any, 'provider'); jest.spyOn(service as any, 'list').mockResolvedValue([]);
    await expect(service.analyze('admin')).resolves.toMatchObject({ reused: true }); expect((service as any).provider).not.toHaveBeenCalled();
  });
  it('skips the provider when fewer than two items are eligible', async () => {
    const { service } = serviceWith({}); jest.spyOn(service as any, 'eligible').mockResolvedValue(rows.slice(0, 1)); jest.spyOn(service as any, 'provider');
    await expect(service.analyze('admin')).resolves.toMatchObject({ notEnoughFeedback: true }); expect((service as any).provider).not.toHaveBeenCalled();
  });
  it('rejects invalid provider membership before persistence and leaves state untouched', async () => {
    const db = { select: jest.fn(() => chain([])) }; const { service } = serviceWith(db);
    jest.spyOn(service as any, 'eligible').mockResolvedValue(rows); jest.spyOn(service as any, 'provider').mockResolvedValue({ ...output, clusters: [{ ...output.clusters[0], feedbackIds: ['missing', 'a'] }] }); const persist = jest.spyOn(service as any, 'persist');
    await expect(service.analyze('admin')).rejects.toThrow(); expect(persist).not.toHaveBeenCalled();
  });
  it('leaves existing state untouched when the provider fails', async () => {
    const db = { select: jest.fn(() => chain([])) }; const { service } = serviceWith(db);
    jest.spyOn(service as any, 'eligible').mockResolvedValue(rows); jest.spyOn(service as any, 'provider').mockRejectedValue(new Error('provider failed')); const persist = jest.spyOn(service as any, 'persist');
    await expect(service.analyze('admin')).rejects.toThrow('provider failed'); expect(persist).not.toHaveBeenCalled();
  });
});

describe('AdminFeedbackClusteringService persistence commands', () => {
  async function persist(active: Array<{ id: string; feedbackId: string | null }>, generated = output, fail = false) { const fake = persistenceDb(active, fail); const { service } = serviceWith(fake.db); await (service as any).persist('admin', 'hash', rows, generated); return fake; }
  it.each([['exact', ['a', 'b']], ['strong overlap', ['a', 'b', 'c']]])('reuses a cluster ID for %s membership', async (_name, ids) => { const fake = await persist(ids.map((feedbackId) => ({ id: 'old', feedbackId }))); expect(fake.tx.update).toHaveBeenCalled(); expect(fake.writes.filter((x) => x.table === feedbackClusters && x.values)).toHaveLength(0); expect(fake.log.indexOf('delete')).toBeLessThan(fake.log.lastIndexOf('insert')); });
  it('creates a new cluster, archives obsolete clusters, and persists deterministic counts below threshold', async () => { const fake = await persist([{ id: 'old', feedbackId: 'c' }]); expect(fake.writes.some((x) => x.table === feedbackClusters && (x.values as any)?.status === 'active')).toBe(true); expect(fake.writes.some((x) => (x.set as any)?.status === 'archived')).toBe(true); expect(fake.writes.some((x) => (x.values as any)?.memberCount === 2 && (x.values as any)?.totalVotes === 5)).toBe(true); });
  it('does not reuse one active cluster twice and archives it when no generated cluster matches', async () => { const generated = { clusters: [{ ...output.clusters[0], feedbackIds: ['a', 'b'] }, { ...output.clusters[0], title: 'Second', feedbackIds: ['a', 'b'] }], unclusteredFeedbackIds: ['c'] }; const fake = await persist([{ id: 'old', feedbackId: 'a' }, { id: 'old', feedbackId: 'b' }], generated); expect(fake.tx.update).toHaveBeenCalledTimes(1); expect(fake.writes.filter((x) => x.table === feedbackClusters && x.values)).toHaveLength(1); });
  it('only writes clustering tables and a failed transaction exposes no committed writes in the fake', async () => { const fake = persistenceDb([{ id: 'old', feedbackId: 'a' }, { id: 'old', feedbackId: 'b' }], true); const { service } = serviceWith(fake.db); await expect((service as any).persist('admin', 'hash', rows, output)).rejects.toThrow('rollback'); expect(fake.writes.every((x) => ![feedbackItems, feedbackVotes].includes(x.table as any))).toBe(true); });
});

const maybeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;
maybeDb('AdminFeedbackClusteringService database integration', () => { it('requires a disposable TEST_DATABASE_URL-backed harness', () => { expect(process.env.TEST_DATABASE_URL).toBeTruthy(); }); });

describe('AdminFeedbackClusteringService provider configuration', () => {
  const context = buildFeedbackClusteringContext(rows.map((row) => ({ ...row.item, voteCount: row.voteCount })));
  function configured(config: Record<string, string | undefined>) { return new AdminFeedbackClusteringService({ db: {} } as never, new ConfigService(config), { write: jest.fn() } as never); }
  it('invokes the configured OpenAI-compatible client', async () => {
    const service = configured({ QWEN_API_KEY: 'key', QWEN_BASE_URL: 'https://provider.example/v1', QWEN_MODEL: 'shared-model' }); const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(output) } }] }); (service as any).client = { chat: { completions: { create } } };
    await expect((service as any).provider(context)).resolves.toEqual(output); expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'shared-model' })); const systemPrompt = create.mock.calls[0][0].messages[0].content as string; expect(systemPrompt).toContain('confidence MUST be one of the exact JSON strings "low", "medium", or "high"'); expect(systemPrompt).toContain('NEVER return a numeric confidence score or percentage');
  });
  it('falls back to the working shared QWEN_MODEL when no clustering model is set', () => { const service = configured({ QWEN_API_KEY: 'key', QWEN_BASE_URL: 'https://provider.example/v1', QWEN_MODEL: 'shared-model' }); expect((service as any).model).toBe('shared-model'); expect((service as any).client).toBeTruthy(); });
  it('returns a safe 503 when required provider configuration is missing', async () => { const service = configured({ QWEN_MODEL: 'shared-model' }); await expect((service as any).provider(context)).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it('converts provider failures into a safe Admin-facing 503 with redacted request diagnostics', async () => { const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(); const service = configured({ QWEN_API_KEY: 'key', QWEN_BASE_URL: 'https://provider.example/v1', QWEN_MODEL: 'shared-model' }); (service as any).client = { chat: { completions: { create: jest.fn().mockRejectedValue(Object.assign(new Error('token=secret'), { status: 429, code: 'rate_limit' })) } } }; await expect((service as any).provider(context)).rejects.toBeInstanceOf(ServiceUnavailableException); const diagnostics = String(warn.mock.calls[0][0]); expect(diagnostics).toContain('network/provider request'); expect(diagnostics).toContain('429'); expect(diagnostics).not.toContain('token=secret'); warn.mockRestore(); });
  it.each([['JSON parsing', '{bad'], ['cluster schema validation', JSON.stringify({ clusters: [{ title: '', summary: 'bad', feedbackIds: ['a', 'b'], confidence: 'high' }], unclusteredFeedbackIds: [] })]])('logs the %s stage without response content', async (stage, content) => { const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(); const service = configured({ QWEN_API_KEY: 'key', QWEN_BASE_URL: 'https://provider.example/v1', QWEN_MODEL: 'shared-model' }); (service as any).client = { chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content } }] }) } } }; await expect((service as any).provider(context)).rejects.toBeInstanceOf(ServiceUnavailableException); const diagnostics = String(warn.mock.calls[0][0]); expect(diagnostics).toContain(stage); expect(diagnostics).not.toContain(content); warn.mockRestore(); });
  it('logs only redacted development diagnostics', () => { const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(); const service = configured({ QWEN_API_KEY: 'super-secret', QWEN_BASE_URL: 'https://provider.example/v1', QWEN_MODEL: 'shared-model' }); const diagnostics = debug.mock.calls.map((call) => String(call[0])).join('\n'); expect(diagnostics).toContain('provider.example'); expect(diagnostics).toContain('shared-model'); expect(diagnostics).not.toContain('super-secret'); expect((service as any).client).toBeTruthy(); debug.mockRestore(); });
});
