import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { users } from '../db/schema';
import { WhiteboardAccessService } from './whiteboard-access.service';

type SocketUser = { id: string; email?: string };
type PatchRecord = Record<string, unknown>;
type RealtimeEnvelope = { protocolVersion: 1; boardId: string; clientId: string; eventId: string; traceId: string; baseRevision?: number; sentAt: string; payload: { added?: PatchRecord[]; updated?: Array<{ before: PatchRecord; after: PatchRecord }>; removed?: PatchRecord[] } };
type TextFinalEnvelope = { protocolVersion: 1; boardId: string; clientId: string; eventId: string; traceId: string; shapeId: string; sequence: number; record: PatchRecord };
type TransformEnvelope = { protocolVersion: 1; boardId: string; clientId: string; eventId: string; interactionId: string; shapeId: string; sequence: number; final: boolean; record: PatchRecord };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECORDS = 250;
const MAX_EVENT_BYTES = 512 * 1024;
const ROOM_PREFIX = 'whiteboard:';

@Injectable()
@WebSocketGateway({ namespace: '/whiteboards', cors: { origin: true, credentials: true }, maxHttpBufferSize: MAX_EVENT_BYTES })
export class WhiteboardGateway {
  @WebSocketServer() server!: Server;
  private readonly rooms = new Map<string, { revision: number; eventIds: Set<string>; textSequences: Map<string, number>; transformSequences: Map<string, { interactionId: string; sequence: number; final: boolean }> }>();

  constructor(private readonly jwt: JwtService, private readonly database: DatabaseService, private readonly access: WhiteboardAccessService) {
    console.error('[WhiteboardRealtimeTrace] GATEWAY_CONSTRUCTED', { namespace: '/whiteboards', path: '/socket.io' });
  }

  afterInit(namespace: Namespace) {
    namespace.use(async (client, next) => {
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] SOCKET_AUTH_BEGIN', { socketId: client.id, property: 'socket.data.user', namespace: '/whiteboards' });
      try {
        const user = await this.authenticateSocket(client);
        client.data ??= {};
        client.data.user = user;
        if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] AUTH_USER_WRITTEN', { socketId: client.id, userId: user.id, property: 'socket.data.user', socketKeys: Object.keys(client), socketDataKeys: Object.keys(client.data), namespace: '/whiteboards' });
        if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] SOCKET_AUTH_OK', { socketId: client.id, userId: user.id, boardId: undefined, namespace: '/whiteboards' });
        next();
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] SOCKET_AUTH_FAILED', { socketId: client.id, property: 'socket.data.user', namespace: '/whiteboards', reason: error instanceof Error ? error.message : 'invalid token' });
        next(new Error('unauthorized'));
      }
    });
  }

  async handleConnection(client: Socket) {
    const namespace = '/whiteboards';
    const user = client.data?.user as SocketUser | undefined;
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] SOCKET_CONNECTED_SERVER', { socketId: client.id, userId: user?.id, boardId: undefined, namespace });
  }

  private async authenticateSocket(client: Socket): Promise<SocketUser> {
    const token = typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : '';
    if (!token) throw new Error('missing token');
    const payload = this.jwt.verify<{ sub?: string; email?: string; tokenVersion?: number }>(token);
    if (!payload.sub) throw new Error('missing subject');
    const current = await this.database.db.query.users.findFirst({ columns: { tokenVersion: true }, where: eq(users.id, payload.sub) });
    if (!current || current.tokenVersion !== (payload.tokenVersion ?? 0)) throw new Error('invalid session');
    return { id: payload.sub, email: payload.email };
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] SOCKET_DISCONNECTED_SERVER', { socketId: client.id, userId: user?.id, boardId: undefined, namespace: '/whiteboards' });
    for (const boardId of Object.keys(client.data.boards ?? {})) delete client.data.boards[boardId];
  }

  @SubscribeMessage('whiteboard:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { boardId?: string; loadedRevision?: number }) {
    const rawBoardId = body?.boardId;
    const boardId = typeof rawBoardId === 'string' ? rawBoardId.trim() : rawBoardId;
    const user = client.data.user as SocketUser | undefined;
    const boardIdIsValid = this.validId(boardId);
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] JOIN_USER_READ', { socketId: client.id, userId: user?.id, property: 'socket.data.user', socketKeys: Object.keys(client), socketDataKeys: Object.keys(client.data ?? {}), namespace: '/whiteboards' });
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] GATEWAY_JOIN_PAYLOAD', { socketId: client.id, authenticatedSocketUserId: user?.id, rawBoardId: JSON.stringify(rawBoardId), boardId: JSON.stringify(boardId), boardIdLength: typeof boardId === 'string' ? boardId.length : undefined, boardIdTrimmed: typeof rawBoardId === 'string' ? rawBoardId.trim() : undefined, boardIdTypeof: typeof rawBoardId, uuidValidationResult: boardIdIsValid, payloadKeys: Object.keys(body ?? {}), payloadTypes: Object.fromEntries(Object.entries(body ?? {}).map(([key, value]) => [key, typeof value])), namespace: '/whiteboards' });
    if (!user || !this.validId(boardId)) {
      const reason = !user ? 'authentication_pending' : 'invalid_board_id';
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] BOARD_JOIN_REJECTED', { socketId: client.id, userId: user?.id, boardId: JSON.stringify(boardId), namespace: '/whiteboards', reason, expected: '{ boardId: string(UUID), loadedRevision?: number }' });
      return this.reject(client, reason);
    }
    try {
      const membership = await this.access.require(user.id, boardId, 'view');
      const room = this.room(boardId);
      await client.join(this.roomName(boardId));
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] BOARD_JOIN_ACCEPTED', { socketId: client.id, userId: user.id, boardId, accessRole: membership.role, namespace: '/whiteboards' });
      client.data.boards = { ...(client.data.boards ?? {}), [boardId]: membership.role };
      client.emit('whiteboard:joined', { boardId, accessRole: membership.role, serverRevision: room.revision, clientId: client.id });
      if (typeof body.loadedRevision === 'number' && body.loadedRevision < room.revision) client.emit('whiteboard:reload-required', { boardId, serverRevision: room.revision });
      return { accepted: true, boardId, accessRole: membership.role, serverRevision: room.revision };
    } catch {
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] BOARD_JOIN_REJECTED', { socketId: client.id, userId: user.id, boardId, namespace: '/whiteboards', reason: 'forbidden' });
      return this.reject(client, 'forbidden');
    }
  }

  @SubscribeMessage('whiteboard:ping')
  async ping(@ConnectedSocket() client: Socket, @MessageBody() body: { boardId?: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !this.validId(body?.boardId)) return { ok: false, reason: 'invalid_payload' };
    try {
      await this.access.require(user.id, body.boardId, 'view');
      return { ok: true, socketId: client.id, boardId: body.boardId };
    } catch {
      return { ok: false, reason: 'forbidden' };
    }
  }

  @SubscribeMessage('whiteboard:debug-message')
  async debugMessage(@ConnectedSocket() client: Socket, @MessageBody() body: { boardId?: string; message?: string; traceId?: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !this.validId(body?.boardId) || typeof body.message !== 'string' || !body.message || body.message.length > 200 || typeof body.traceId !== 'string') return this.reject(client, 'invalid_payload');
    if (client.data.boards?.[body.boardId] === undefined) return this.reject(client, 'forbidden');
    const roomName = this.roomName(body.boardId);
    const recipients = Math.max(0, (await this.server.in(roomName).fetchSockets()).length - 1);
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] DEBUG_MESSAGE_BROADCAST', { traceId: body.traceId, boardId: body.boardId, senderSocketId: client.id, recipientCount: recipients, roomName, namespace: '/whiteboards' });
    client.to(roomName).emit('whiteboard:debug-message', { boardId: body.boardId, message: body.message, traceId: body.traceId, senderSocketId: client.id });
    return { ok: true, traceId: body.traceId, recipientCount: recipients };
  }

  @SubscribeMessage('whiteboard:debug-synthetic')
  async debugSynthetic(@ConnectedSocket() client: Socket, @MessageBody() body: { boardId?: string; traceId?: string; shape?: { id?: string; type?: string; x?: number; y?: number; props?: Record<string, unknown> } }) {
    const user = client.data.user as SocketUser | undefined;
    const shape = body?.shape;
    if (!user || !this.validId(body?.boardId) || typeof body.traceId !== 'string' || !shape || typeof shape.id !== 'string' || !/^shape:[A-Za-z0-9_-]+$/.test(shape.id) || shape.type !== 'geo' || typeof shape.x !== 'number' || typeof shape.y !== 'number' || !shape.props) return this.reject(client, 'invalid_payload');
    if (client.data.boards?.[body.boardId] === undefined) return this.reject(client, 'forbidden');
    const roomName = this.roomName(body.boardId);
    client.to(roomName).emit('whiteboard:debug-synthetic', { boardId: body.boardId, traceId: body.traceId, shape, senderSocketId: client.id });
    return { ok: true, traceId: body.traceId };
  }

  @SubscribeMessage('whiteboard:leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { boardId?: string }) {
    if (!this.validId(body?.boardId)) return this.reject(client, 'invalid_payload');
    await client.leave(this.roomName(body.boardId));
    if (client.data.boards) delete client.data.boards[body.boardId];
    client.emit('whiteboard:left', { boardId: body.boardId });
    return { accepted: true, boardId: body.boardId };
  }

  @SubscribeMessage('whiteboard:mutation')
  async mutation(@ConnectedSocket() client: Socket, @MessageBody() envelope: RealtimeEnvelope) {
    const user = client.data.user as SocketUser | undefined;
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] GATEWAY_RECEIVE', { traceId: envelope?.traceId, eventId: envelope?.eventId, boardId: envelope?.boardId, socketId: client.id, serverRevision: this.room(envelope?.boardId ?? '').revision, localAppliedRevision: 0, latestServerRevision: this.room(envelope?.boardId ?? '').revision, loadedRevision: envelope?.baseRevision });
    if (!user || !this.validEnvelope(envelope)) return this.reject(client, 'invalid_payload');
    if (client.data.boards?.[envelope.boardId] === undefined) return this.reject(client, 'forbidden', envelope.eventId);
    try {
      const membership = await this.access.require(user.id, envelope.boardId, 'edit');
      if (process.env.NODE_ENV !== 'production') console.debug('[WhiteboardRealtimeTrace] mutation authorized', { socketId: client.id, userId: user.id, boardId: envelope.boardId, eventId: envelope.eventId });
      const room = this.room(envelope.boardId);
      if (room.eventIds.has(envelope.eventId)) return { accepted: true, duplicate: true, eventId: envelope.eventId, serverRevision: room.revision };
      room.eventIds.add(envelope.eventId);
      if (room.eventIds.size > 2000) room.eventIds.delete(room.eventIds.values().next().value as string);
      room.revision += 1;
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] MUTATION_EMIT_SOURCE', { file: 'whiteboard.gateway.ts', function: 'mutation', kind: 'room-relay', updatedRecordIds: envelope.payload.updated?.map((change) => change.after.id) ?? [], updatedShapeTypes: envelope.payload.updated?.map((change) => change.after.type) ?? [], callStack: new Error().stack });
      client.to(this.roomName(envelope.boardId)).emit('whiteboard:mutation', { ...envelope, serverRevision: room.revision, accessRole: membership.role });
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] GATEWAY_BROADCAST', { traceId: envelope.traceId, eventId: envelope.eventId, boardId: envelope.boardId, socketId: client.id, serverRevision: room.revision, localAppliedRevision: 0, latestServerRevision: room.revision, loadedRevision: envelope.baseRevision });
      client.emit('whiteboard:mutation-accepted', { accepted: true, eventId: envelope.eventId, serverRevision: room.revision });
      return { accepted: true, eventId: envelope.eventId, serverRevision: room.revision };
    } catch {
      return this.reject(client, 'forbidden', envelope.eventId);
    }
  }

  @SubscribeMessage('whiteboard:text-final')
  async textFinal(@ConnectedSocket() client: Socket, @MessageBody() payload: TextFinalEnvelope) {
    const user = client.data.user as SocketUser | undefined;
    const record = payload?.record;
    if (!user) return { accepted: false, reason: 'forbidden', eventId: payload?.eventId };
    if (!payload || payload.protocolVersion !== 1 || !this.validId(payload.boardId) || typeof payload.clientId !== 'string' || typeof payload.eventId !== 'string' || typeof payload.traceId !== 'string' || typeof payload.shapeId !== 'string' || payload.shapeId !== record?.id || typeof payload.sequence !== 'number' || !record || record.typeName !== 'shape' || (record.type !== 'text' && record.type !== 'note') || Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_EVENT_BYTES) return { accepted: false, reason: 'invalid_shape', eventId: payload?.eventId };
    if (typeof record.parentId !== 'string' || !record.parentId.startsWith('page:')) return { accepted: false, reason: 'invalid_parent', eventId: payload.eventId };
    if (client.data.boards?.[payload.boardId] === undefined) return { accepted: false, reason: 'room_not_joined', eventId: payload.eventId };
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardTextTrace] TEXT_FINAL_GATEWAY_RECEIVE', { traceId: payload.traceId, eventId: payload.eventId, boardId: payload.boardId, shapeId: payload.shapeId, sequence: payload.sequence, socketId: client.id, clientId: payload.clientId });
    try {
      const membership = await this.access.require(user.id, payload.boardId, 'edit');
      const room = this.room(payload.boardId);
      if (room.eventIds.has(payload.eventId)) return { accepted: true, duplicate: true, eventId: payload.eventId, serverRevision: room.revision };
      const previousSequence = room.textSequences.get(payload.shapeId) ?? 0;
      if (payload.sequence <= previousSequence) return { accepted: false, reason: 'stale_sequence', eventId: payload.eventId, serverRevision: room.revision };
      room.textSequences.set(payload.shapeId, payload.sequence);
      room.eventIds.add(payload.eventId);
      room.revision += 1;
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardTextTrace] TEXT_FINAL_GATEWAY_BROADCAST', { traceId: payload.traceId, eventId: payload.eventId, boardId: payload.boardId, shapeId: payload.shapeId, sequence: payload.sequence, socketId: client.id, clientId: payload.clientId });
      client.to(this.roomName(payload.boardId)).emit('whiteboard:text-final', payload);
      client.emit('whiteboard:text-final-accepted', { accepted: true, eventId: payload.eventId, serverRevision: room.revision, accessRole: membership.role });
      return { accepted: true, eventId: payload.eventId, serverRevision: room.revision };
    } catch {
      return { accepted: false, reason: 'forbidden', eventId: payload.eventId };
    }
  }

  @SubscribeMessage('whiteboard:transform')
  async transform(@ConnectedSocket() client: Socket, @MessageBody() payload: TransformEnvelope) {
    const user = client.data.user as SocketUser | undefined;
    const record = payload?.record;
    const valid = Boolean(user) && payload?.protocolVersion === 1 && this.validId(payload?.boardId) && typeof payload?.clientId === 'string' && typeof payload?.eventId === 'string' && typeof payload?.interactionId === 'string' && typeof payload?.shapeId === 'string' && typeof payload?.sequence === 'number' && typeof payload?.final === 'boolean' && payload.shapeId === record?.id && record?.typeName === 'shape' && record?.type !== 'text' && record?.type !== 'note' && typeof record?.parentId === 'string' && record.parentId.startsWith('page:') && Buffer.byteLength(JSON.stringify(payload), 'utf8') <= MAX_EVENT_BYTES;
    if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] TRANSFORM_GATEWAY_RECEIVE', { boardId: payload?.boardId, shapeId: payload?.shapeId, interactionId: payload?.interactionId, sequence: payload?.sequence, final: payload?.final, socketId: client.id });
    if (!valid) return { accepted: false, reason: 'invalid_transform', eventId: payload?.eventId };
    if (client.data.boards?.[payload.boardId] === undefined) return { accepted: false, reason: 'room_not_joined', eventId: payload.eventId };
    try {
      const membership = await this.access.require(user!.id, payload.boardId, 'edit');
      const room = this.room(payload.boardId);
      const previous = room.transformSequences.get(payload.shapeId);
      if (previous && (previous.final || payload.sequence <= previous.sequence)) return { accepted: false, reason: 'stale_sequence', eventId: payload.eventId };
      room.transformSequences.set(payload.shapeId, { interactionId: payload.interactionId, sequence: payload.sequence, final: payload.final });
      if (payload.final) room.revision += 1;
      const outgoing = { ...payload, accessRole: membership.role, ...(payload.final ? { serverRevision: room.revision } : {}) };
      if (payload.final) client.to(this.roomName(payload.boardId)).emit('whiteboard:transform', outgoing);
      else client.to(this.roomName(payload.boardId)).volatile.emit('whiteboard:transform', outgoing);
      if (process.env.NODE_ENV !== 'production') console.error('[WhiteboardRealtimeTrace] TRANSFORM_GATEWAY_BROADCAST', { boardId: payload.boardId, shapeId: payload.shapeId, interactionId: payload.interactionId, sequence: payload.sequence, final: payload.final, socketId: client.id });
      return { accepted: true, eventId: payload.eventId, serverRevision: room.revision };
    } catch { return { accepted: false, reason: 'forbidden', eventId: payload.eventId }; }
  }

  private validId(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
  private validEnvelope(value: RealtimeEnvelope) {
    if (!value || value.protocolVersion !== 1 || !this.validId(value.boardId) || typeof value.clientId !== 'string' || typeof value.eventId !== 'string' || typeof value.traceId !== 'string' || value.eventId.length > 120 || value.traceId.length > 120 || !value.payload) return false;
    const payload = value.payload;
    const count = (payload.added?.length ?? 0) + (payload.updated?.length ?? 0) + (payload.removed?.length ?? 0);
    return count > 0 && count <= MAX_RECORDS && Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_EVENT_BYTES;
  }
  private roomName(boardId: string) { return `${ROOM_PREFIX}${boardId}`; }
  private room(boardId: string) { let room = this.rooms.get(boardId); if (!room) { room = { revision: 0, eventIds: new Set(), textSequences: new Map(), transformSequences: new Map() }; this.rooms.set(boardId, room) } return room; }
  private reject(client: Socket, reason: string, eventId?: string) { const value = { accepted: false, reason, ...(eventId ? { eventId } : {}) }; client.emit('whiteboard:mutation-rejected', value); return value; }
}
