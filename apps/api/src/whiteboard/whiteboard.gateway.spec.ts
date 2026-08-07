import { WhiteboardGateway } from './whiteboard.gateway';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';

function client(role = 'editor') {
  const emitted: Array<[string, unknown]> = [];
  const peer = { emit: jest.fn((event: string, payload: unknown) => emitted.push([event, payload])), volatile: { emit: jest.fn((event: string, payload: unknown) => emitted.push([event, payload])) } };
  return {
    id: 'socket-1',
    handshake: { auth: { token: 'token' } },
    data: { user: { id: 'user-1' }, boards: { [BOARD_ID]: role } },
    join: jest.fn(), leave: jest.fn(), emit: jest.fn((event: string, payload: unknown) => emitted.push([event, payload])),
    to: jest.fn(() => peer), emitted, peer,
    disconnect: jest.fn(),
  } as never;
}

describe('WhiteboardGateway', () => {
  function setup(role = 'editor') {
    const access = { require: jest.fn((_userId: string, _boardId: string, permission: string) => role === 'viewer' && permission === 'edit' ? Promise.reject(new Error('forbidden')) : Promise.resolve({ role, board: { updatedAt: new Date() } })) };
    const database = { db: { query: { users: { findFirst: jest.fn().mockResolvedValue({ tokenVersion: 0 }) } } } };
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'user-1', tokenVersion: 0 }) };
    return { gateway: new WhiteboardGateway(jwt as never, database as never, access as never), access };
  }

  it('allows an authenticated editor to join and publish a patch', async () => {
    const { gateway, access } = setup('editor');
    const socket = client('editor');
    await gateway.handleConnection(socket);
    const joined = await gateway.join(socket, { boardId: BOARD_ID, loadedRevision: 0 });
    const result = await gateway.mutation(socket, { protocolVersion: 1, boardId: BOARD_ID, clientId: 'client-1', eventId: 'event-1', traceId: 'trace-1', sentAt: new Date().toISOString(), payload: { added: [{ id: 'shape:1', typeName: 'shape', type: 'geo' }] } });
    expect(joined).toMatchObject({ accepted: true, accessRole: 'editor' });
    expect(result).toMatchObject({ accepted: true, eventId: 'event-1', serverRevision: 1 });
    expect(access.require).toHaveBeenCalledWith('user-1', BOARD_ID, 'edit');
  });

  it('rejects viewer mutations and ignores duplicate event IDs', async () => {
    const { gateway } = setup('viewer');
    const socket = client('viewer');
    await gateway.join(socket, { boardId: BOARD_ID });
    const payload = { protocolVersion: 1 as const, boardId: BOARD_ID, clientId: 'client-1', eventId: 'event-2', traceId: 'trace-2', sentAt: new Date().toISOString(), payload: { added: [{ id: 'shape:1', typeName: 'shape' }] } };
    await expect(gateway.mutation(socket, payload)).resolves.toMatchObject({ accepted: false, reason: 'forbidden' });

    const { gateway: editorGateway } = setup('editor');
    const editor = client('editor');
    await editorGateway.join(editor, { boardId: BOARD_ID });
    await expect(editorGateway.mutation(editor, payload)).resolves.toMatchObject({ accepted: true });
    await expect(editorGateway.mutation(editor, payload)).resolves.toMatchObject({ accepted: true, duplicate: true });
  });

  it('accepts a dedicated text-final envelope', async () => {
    const { gateway } = setup('editor');
    const socket = client('editor');
    await gateway.join(socket, { boardId: BOARD_ID });
    await expect(gateway.textFinal(socket, {
      protocolVersion: 1,
      boardId: BOARD_ID,
      clientId: 'client-text',
      eventId: 'event-text',
      traceId: 'trace-text',
      shapeId: 'shape:text',
      sequence: 1,
      record: { id: 'shape:text', typeName: 'shape', type: 'text', parentId: 'page:1', props: { richText: 'hello' } },
    })).resolves.toMatchObject({ accepted: true, eventId: 'event-text' });
    expect((socket as unknown as { emitted: Array<[string, unknown]> }).emitted.some(([event, value]) => event === 'whiteboard:text-final' && (value as { traceId?: string }).traceId === 'trace-text')).toBe(true);
  });

  it('rejects viewer text-final events and ignores duplicate or stale finals', async () => {
    const { gateway } = setup('viewer');
    const viewer = client('viewer');
    await gateway.join(viewer, { boardId: BOARD_ID });
    const payload = { protocolVersion: 1 as const, boardId: BOARD_ID, clientId: 'viewer', eventId: 'viewer-final', traceId: 'trace-viewer', shapeId: 'shape:text', sequence: 1, record: { id: 'shape:text', typeName: 'shape', type: 'text', parentId: 'page:1', props: {} } };
    await expect(gateway.textFinal(viewer, payload)).resolves.toMatchObject({ accepted: false, reason: 'forbidden' });

    const { gateway: editorGateway } = setup('editor');
    const editor = client('editor');
    await editorGateway.join(editor, { boardId: BOARD_ID });
    await expect(editorGateway.textFinal(editor, payload)).resolves.toMatchObject({ accepted: true });
    await expect(editorGateway.textFinal(editor, { ...payload, eventId: 'viewer-final-duplicate' })).resolves.toMatchObject({ accepted: false, reason: 'stale_sequence' });
  });

  it('coalesced transform envelopes relay volatile updates and reliable finals', async () => {
    const { gateway } = setup('editor');
    const socket = client('editor');
    await gateway.join(socket, { boardId: BOARD_ID });
    const base = { protocolVersion: 1 as const, boardId: BOARD_ID, clientId: 'client-transform', interactionId: 'interaction-1', shapeId: 'shape:geo', record: { id: 'shape:geo', typeName: 'shape', type: 'geo', parentId: 'page:1', props: { geo: 'rectangle' } } };
    await expect(gateway.transform(socket, { ...base, eventId: 'transform-1', sequence: 1, final: false })).resolves.toMatchObject({ accepted: true });
    expect((socket as unknown as { peer: { volatile: { emit: jest.Mock } } }).peer.volatile.emit).toHaveBeenCalledWith('whiteboard:transform', expect.objectContaining({ final: false, sequence: 1 }));
    await expect(gateway.transform(socket, { ...base, eventId: 'transform-2', sequence: 2, final: true })).resolves.toMatchObject({ accepted: true });
    expect((socket as unknown as { peer: { emit: jest.Mock } }).peer.emit).toHaveBeenCalledWith('whiteboard:transform', expect.objectContaining({ final: true, sequence: 2 }));
    await expect(gateway.transform(socket, { ...base, eventId: 'transform-3', sequence: 1, final: false })).resolves.toMatchObject({ accepted: false, reason: 'stale_sequence' });
  });

  it('answers the authenticated board ping smoke test', async () => {
    const { gateway } = setup('editor');
    const socket = client('editor');
    await gateway.handleConnection(socket);
    await expect(gateway.ping(socket, { boardId: BOARD_ID })).resolves.toMatchObject({ ok: true, socketId: 'socket-1', boardId: BOARD_ID });
  });

  it('authenticates the socket before connection handling and board join', async () => {
    const { gateway } = setup('editor');
    const namespace = { use: jest.fn() } as never;
    gateway.afterInit(namespace);
    const middleware = (namespace as { use: jest.Mock }).use.mock.calls[0][0] as (socket: ReturnType<typeof client>, next: (error?: Error) => void) => Promise<void>;
    const socket = client('editor');
    socket.data.user = undefined;
    let authError: Error | undefined;
    await middleware(socket, (error?: Error) => { authError = error; });

    expect(authError).toBeUndefined();
    expect(socket.data.user).toEqual({ id: 'user-1', email: undefined });
    await gateway.handleConnection(socket);
    await expect(gateway.join(socket, { boardId: BOARD_ID })).resolves.toMatchObject({ accepted: true, accessRole: 'editor' });
  });

  it('rejects an invalid socket token before connection handling', async () => {
    const { gateway } = setup('editor');
    const namespace = { use: jest.fn() } as never;
    gateway.afterInit(namespace);
    const middleware = (namespace as { use: jest.Mock }).use.mock.calls[0][0] as (socket: ReturnType<typeof client>, next: (error?: Error) => void) => Promise<void>;
    const socket = client('editor');
    socket.data.user = undefined;
    const jwt = (gateway as unknown as { jwt: { verify: jest.Mock } }).jwt;
    jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });
    let authError: Error | undefined;
    await middleware(socket, (error?: Error) => { authError = error; });

    expect(authError).toBeInstanceOf(Error);
    expect(authError?.message).toBe('unauthorized');
    expect(socket.data.user).toBeUndefined();
  });
});
