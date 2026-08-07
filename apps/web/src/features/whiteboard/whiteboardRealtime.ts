import { io, type Socket } from 'socket.io-client'
import type { Editor } from 'tldraw'
import { API_BASE_URL } from '../../lib/api'
import { createWhiteboardUuid } from './whiteboardUuid'

export type WhiteboardRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'access-lost'
type RecordValue = Record<string, unknown>
type UpdatedRecord = { before: RecordValue; after: RecordValue; shapeSequence?: number }
type TextFinalPayload = { protocolVersion: 1; boardId: string; clientId: string; eventId: string; traceId: string; shapeId: string; sequence: number; record: RecordValue }
type TransformPayload = { protocolVersion: 1; boardId: string; clientId: string; eventId: string; interactionId: string; shapeId: string; sequence: number; final: boolean; record: RecordValue }
export type TextStoreWriteSource = 'local-user' | 'remote-text-content' | 'remote-text-final' | 'remote-normal-mutation' | 'http-reload' | 'snapshot-restore' | 'autosave-response' | 'unknown'
export type WhiteboardRealtimeDebugApi = { socketId: () => string | undefined; sendDebugMessage: (message: string) => string; sendSyntheticRectangle: () => string }
export type WhiteboardRealtimeLifecycle = { event: string; error?: string; disconnectReason?: string; url: string; path: string; namespace: string; socketId?: string; socketConnected: boolean; socketActive: boolean; socketDisconnected: boolean }
type RealtimeCallbacks = { onStatus?: (status: WhiteboardRealtimeStatus) => void; onRemotePatch?: (serverRevision: number, traceId: string) => void; onReloadRequired?: (traceId?: string) => void; getAccessRole?: () => string | undefined; getEditor?: () => Editor | null; getEditorInstanceId?: () => string | undefined; getVisibleEditorInstanceId?: () => string | undefined; onDebugApi?: (api: WhiteboardRealtimeDebugApi | null) => void; onDebugMessage?: (value: { boardId: string; message: string; traceId: string; senderSocketId?: string }) => void; onDebugSynthetic?: (shapeId: string, traceId: string) => void; onLifecycle?: (value: WhiteboardRealtimeLifecycle) => void }

const persistentTypeNames = new Set(['shape', 'binding', 'asset', 'page'])
export function shouldDisableWhiteboardRealtime(env: { DEV?: boolean; VITE_WHITEBOARD_DISABLE_REALTIME?: string } = import.meta.env) {
  return env.DEV === true && env.VITE_WHITEBOARD_DISABLE_REALTIME === 'true'
}

export const TEXT_SYNC_ISOLATION_MODE = import.meta.env.DEV && import.meta.env.VITE_WHITEBOARD_TEXT_SYNC_ISOLATION === 'true'
export const WHITEBOARD_REALTIME_DISABLED = shouldDisableWhiteboardRealtime()

export function isTextShapeRecord(record: RecordValue) {
  return record.typeName === 'shape' && (record.type === 'text' || record.type === 'note')
}

const lastTextWriteGeometry = new Map<string, { source: TextStoreWriteSource; geometry: Record<string, unknown>; timestamp: number }>()

function textGeometry(record: RecordValue) {
  const props = record.props && typeof record.props === 'object' ? record.props as Record<string, unknown> : {}
  return { x: record.x, y: record.y, w: props.w ?? record.w, h: props.h ?? record.h, growY: props.growY ?? record.growY }
}

export function traceTextStoreWrite(record: RecordValue, source: TextStoreWriteSource, sequence?: number, editingShapeId?: string | null) {
  if (!isTextShapeRecord(record)) return
  const shapeId = String(record.id)
  const geometry = textGeometry(record)
  const timestamp = Date.now()
  const previous = lastTextWriteGeometry.get(shapeId)
  if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] STORE_WRITE', { shapeId, source, sequence, ...geometry, editingShapeId: editingShapeId ?? null, timestamp })
  if (previous && JSON.stringify(previous.geometry) !== JSON.stringify(geometry) && previous.source !== source && import.meta.env.DEV) {
    console.error('[WhiteboardTextTrace] GEOMETRY_OSCILLATION', { shapeId, previousSource: previous.source, currentSource: source, previousGeometry: previous.geometry, currentGeometry: geometry })
  }
  lastTextWriteGeometry.set(shapeId, { source, geometry, timestamp })
}

export function getTextDiff(before: RecordValue, after: RecordValue) {
  const changedFields: Record<string, unknown> = {}
  for (const field of ['x', 'y', 'w', 'h', 'growY', 'scale', 'rotation']) {
    if (before[field] !== after[field]) changedFields[field] = after[field]
  }
  const beforeProps = before.props && typeof before.props === 'object' ? before.props as Record<string, unknown> : {}
  const afterProps = after.props && typeof after.props === 'object' ? after.props as Record<string, unknown> : {}
  for (const field of ['richText', 'textAlign', 'font', 'size', 'color', 'labelColor']) {
    if (beforeProps[field] !== afterProps[field]) changedFields[field] = field === 'richText' ? '[changed]' : afterProps[field]
  }
  return changedFields
}

export function getLocalTextGeometryChanges(before: RecordValue, after: RecordValue) {
  if (!isTextShapeRecord(after)) return null
  const beforeProps = before.props && typeof before.props === 'object' ? before.props as Record<string, unknown> : {}
  const afterProps = after.props && typeof after.props === 'object' ? after.props as Record<string, unknown> : {}
  const changed: Record<string, unknown> = {}
  const fields: Array<[string, unknown, unknown]> = [
    ['x', before.x, after.x],
    ['y', before.y, after.y],
    ['w', beforeProps.w, afterProps.w],
    ['h', beforeProps.h, afterProps.h],
    ['growY', beforeProps.growY, afterProps.growY],
    ['autoSize', beforeProps.autoSize, afterProps.autoSize],
    ['scale', beforeProps.scale, afterProps.scale],
    ['richText', beforeProps.richText, afterProps.richText],
  ]
  for (const [field, previous, current] of fields) {
    if (previous !== current) changed[field] = field === 'richText' ? '[changed]' : current
  }
  return Object.keys(changed).length ? changed : null
}

export function connectWhiteboardRealtime(accessToken: string, boardId: string, editor: Editor, callbacks: RealtimeCallbacks = {}) {
  if (WHITEBOARD_REALTIME_DISABLED) {
    callbacks.onStatus?.('offline')
    callbacks.onDebugApi?.(null)
    return () => undefined
  }
  const clientId = createWhiteboardUuid()
  const socketUrl = `${API_BASE_URL}/whiteboards`
  if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] SOCKET_CREATE', { url: socketUrl, namespace: '/whiteboards', path: '/socket.io', socketId: undefined, boardId, accessTokenPresent: Boolean(accessToken), autoConnect: false })
  const socket: Socket = io(socketUrl, { auth: { token: accessToken }, transports: ['websocket', 'polling'], reconnection: true, autoConnect: false })
  const socketState = () => {
    const manager = socket.io as unknown as { uri?: string; opts?: { path?: string; transports?: unknown; autoConnect?: boolean; withCredentials?: boolean } }
    return {
      socketId: socket.id,
      socketConnected: socket.connected,
      socketActive: socket.active,
      socketDisconnected: socket.disconnected,
      ioUri: manager.uri,
      ioOpts: { path: manager.opts?.path, transports: manager.opts?.transports, autoConnect: manager.opts?.autoConnect, withCredentials: manager.opts?.withCredentials },
    }
  }
  const reportLifecycle = (event: string, extra: { error?: string; disconnectReason?: string } = {}) => {
    const state = socketState()
    const lifecycle = { event, url: socketUrl, path: '/socket.io', namespace: '/whiteboards', ...state, ...extra }
    callbacks.onLifecycle?.(lifecycle)
    if (import.meta.env.DEV) console.error(`[WhiteboardRealtimeTrace] ${event}`, lifecycle)
  }
  reportLifecycle('SOCKET_CREATE')
  let applyingRemote = false
  let serverRevision = 0
  let latestAppliedRealtimeRevision = 0
  let transportConnected = false
  let joinedBoardId: string | null = null
  const seen = new Set<string>()
  const seenTextFinalEvents = new Set<string>()
  const lastAppliedTextSequence = new Map<string, number>()
  const nextTextSequence = new Map<string, number>()
  const textEditSessions = new Map<string, { traceId: string; shapeId: string; finalCount: number }>()
  const nextTransformSequence = new Map<string, number>()
  const lastAppliedTransform = new Map<string, { interactionId: string; sequence: number; final: boolean }>()
  let activeTransform: { interactionId: string; name: string; path: string; shapeIds: Set<string>; pending: Map<string, RecordValue> } | null = null
  let transformFlushTimer: ReturnType<typeof setTimeout> | undefined
  const emitStatus = (status: WhiteboardRealtimeStatus) => callbacks.onStatus?.(status)
  const getActiveEditor = () => callbacks.getEditor?.() ?? editor
  const editorInstanceId = callbacks.getEditorInstanceId?.() ?? 'editor-at-connection'

  const isPersistent = (record: RecordValue) => persistentTypeNames.has(String(record.typeName))
  const editingShapeId = () => {
    const candidate = getActiveEditor() as Editor & { getEditingShapeId?: () => string | null }
    return candidate.getEditingShapeId?.() ?? null
  }
  const isTransformInteraction = (name: string, path: string) => {
    const value = `${name} ${path}`.toLowerCase()
    return ['translat', 'resize', 'rotate', 'draw', 'arrow', 'line', 'brush', 'lasso', 'crop'].some((token) => value.includes(token))
  }
  const transformRecord = (record: RecordValue) => record.typeName === 'shape' && !isTextShapeRecord(record)
  const nextTransformSequenceFor = (shapeId: string) => {
    const sequence = (nextTransformSequence.get(shapeId) ?? 0) + 1
    nextTransformSequence.set(shapeId, sequence)
    return sequence
  }
  const emitTransform = (record: RecordValue, interactionId: string, final: boolean) => {
    const shapeId = String(record.id)
    const payload: TransformPayload = { protocolVersion: 1, boardId, clientId, eventId: createWhiteboardUuid(), interactionId, shapeId, sequence: nextTransformSequenceFor(shapeId), final, record }
    if (import.meta.env.DEV) console.error(`[WhiteboardRealtimeTrace] ${final ? 'TRANSFORM_FINAL_EMITTED' : 'TRANSFORM_FLUSHED'}`, { socketId: socket.id, ...payload, shapeType: record.type })
    if (final) {
      socket.emit('whiteboard:transform', payload, (ack: { accepted?: boolean; reason?: string }) => {
        if (import.meta.env.DEV && !ack?.accepted) console.error('[WhiteboardRealtimeTrace] TRANSFORM_FINAL_REJECTED', { boardId, shapeId, interactionId, sequence: payload.sequence, reason: ack?.reason })
      })
    } else {
      socket.volatile.emit('whiteboard:transform', payload)
    }
  }
  const flushTransforms = () => {
    if (transformFlushTimer) { clearTimeout(transformFlushTimer); transformFlushTimer = undefined }
    const current = activeTransform
    if (!current) return
    for (const record of current.pending.values()) emitTransform(record, current.interactionId, false)
    current.pending.clear()
  }
  const scheduleTransformFlush = () => {
    if (transformFlushTimer || !activeTransform?.pending.size) return
    transformFlushTimer = setTimeout(() => { transformFlushTimer = undefined; flushTransforms() }, 33)
  }
  const captureTransform = (record: RecordValue) => {
    if (!activeTransform || !transformRecord(record)) return false
    const shapeId = String(record.id)
    activeTransform.shapeIds.add(shapeId)
    const replaced = activeTransform.pending.has(shapeId)
    activeTransform.pending.set(shapeId, record)
    if (import.meta.env.DEV) console.error(`[WhiteboardRealtimeTrace] TRANSFORM_UPDATE_${replaced ? 'REPLACED' : 'CAPTURED'}`, { boardId, clientId, socketId: socket.id, interactionId: activeTransform.interactionId, shapeId, sequence: nextTransformSequence.get(shapeId) ?? 0, shapeType: record.type })
    scheduleTransformFlush()
    return true
  }
  const endTransform = () => {
    const current = activeTransform
    if (!current) return
    flushTransforms()
    for (const shapeId of current.shapeIds) {
      const record = getActiveEditor()?.store.get(shapeId as never) as RecordValue | undefined
      if (record && transformRecord(record)) emitTransform(record, current.interactionId, true)
    }
    activeTransform = null
  }
  const emitMutation = (added: RecordValue[], updated: UpdatedRecord[], removed: RecordValue[]) => {
    const currentEditingShapeId = editingShapeId()
    const filteredUpdated = updated.filter((change) => {
      const activeText = isTextShapeRecord(change.after) && currentEditingShapeId === String(change.after.id)
      if (activeText && import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FILTERED_FROM_NORMAL_PATCH', { boardId, shapeId: change.after.id, editingShapeId: currentEditingShapeId })
      return !activeText
    })
    updated = filteredUpdated.filter((change) => {
      const active = activeTransform?.shapeIds.has(String(change.after.id))
      if (active && import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] TRANSFORM_FILTERED_FROM_NORMAL_PATCH', { boardId, shapeId: change.after.id, interactionId: activeTransform?.interactionId })
      return !active
    })
    if (!added.length && !updated.length && !removed.length) { if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] CLIENT_EMIT_SKIPPED', { reason: 'empty_patch', boardId }); return }
    if (import.meta.env.DEV && updated.some((change) => isTextShapeRecord(change.after) && String(change.after.id) === String(currentEditingShapeId))) throw new Error('Active text shape entered a normal whiteboard mutation payload')
    const eventId = createWhiteboardUuid()
    const traceId = createWhiteboardUuid()
    seen.add(eventId)
    const accessRole = callbacks.getAccessRole?.()
    const skipReason = !transportConnected ? 'socket_disconnected' : joinedBoardId !== boardId ? 'room_not_joined' : accessRole !== 'owner' && accessRole !== 'editor' ? 'viewer' : null
    if (skipReason) { if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] CLIENT_EMIT_SKIPPED', { reason: skipReason, traceId, eventId, boardId, socketId: socket.id }); return }
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] LOCAL_CAPTURE', { traceId, eventId, boardId, clientId, socketId: socket.id, serverRevision, localAppliedRevision: latestAppliedRealtimeRevision, latestServerRevision: serverRevision, loadedRevision: 0, addedIds: added.map((record) => record.id), updatedIds: updated.map((change) => change.after.id), removedIds: removed.map((record) => record.id) })
    const payload = { added, updated, removed }
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] MUTATION_EMIT_SOURCE', { file: 'whiteboardRealtime.ts', function: 'emitMutation', callStack: new Error().stack, updatedRecordIds: updated.map((change) => change.after.id), updatedShapeTypes: updated.map((change) => change.after.type) })
    socket.emit('whiteboard:mutation', { protocolVersion: 1, boardId, clientId, eventId, traceId, baseRevision: serverRevision, sentAt: new Date().toISOString(), payload })
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] CLIENT_EMIT', { traceId, eventId, boardId, clientId, socketId: socket.id, serverRevision, localAppliedRevision: latestAppliedRealtimeRevision, latestServerRevision: serverRevision, loadedRevision: 0 })
    return eventId
  }
  const onChange = (entry: { changes: { added: Record<string, RecordValue>; updated: Record<string, [RecordValue, RecordValue]>; removed: Record<string, RecordValue> }; source?: string; scope?: string }, finalizedShapeId: string | null = null) => {
    const { changes } = entry
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] STORE_CHANGE_RAW', { boardId, addedKeys: Object.keys(changes.added), updatedKeys: Object.keys(changes.updated), removedKeys: Object.keys(changes.removed), actualTypeNames: [...Object.values(changes.added), ...Object.values(changes.removed)].map((record) => record.typeName), source: entry.source, scope: entry.scope })
    if (applyingRemote) return
    const added = Object.values(changes.added).filter(isPersistent)
    const updated = Object.values(changes.updated).filter(([before, after]) => isPersistent(before) || isPersistent(after)).map(([before, after]) => ({ before, after }))
    const removed = Object.values(changes.removed).filter(isPersistent)
    const currentEditingShapeId = editingShapeId()
    for (const record of added) {
      const shapeId = String(record.id)
      if (isTextShapeRecord(record) && shapeId === currentEditingShapeId && !textEditSessions.has(shapeId)) {
        const traceId = createWhiteboardUuid()
        textEditSessions.set(shapeId, { traceId, shapeId, finalCount: 0 })
        if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_EDIT_STARTED', { traceId, eventId: undefined, boardId, shapeId, sequence: undefined, socketId: socket.id, clientId })
      }
    }
    for (const record of [...added, ...removed, ...updated.map((change) => change.after)]) traceTextStoreWrite(record, 'local-user', nextTextSequence.get(String(record.id)), currentEditingShapeId)
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] STORE_CHANGE_FILTERED', { boardId, addedIds: added.map((record) => record.id), updatedIds: updated.map((change) => change.after.id), removedIds: removed.map((record) => record.id), excluded: [...Object.values(changes.added), ...Object.values(changes.removed)].filter((record) => !isPersistent(record)).map((record) => ({ id: record.id, typeName: record.typeName, reason: 'not-persistent-document-record' })) })
    const transformAdded = added.filter((record) => captureTransform(record))
    const normalAdded = added.filter((record) => !transformAdded.includes(record))
    const immediateUpdated: UpdatedRecord[] = []
    updated.forEach(({ before, after }) => {
      if (captureTransform(after)) return
      if (!isTextShapeRecord(after)) immediateUpdated.push({ before, after })
      else {
        const shapeId = String(after.id)
        if (finalizedShapeId === shapeId) return
        const currentlyEditing = editingShapeId() === shapeId
        if (currentlyEditing && !added.some((record) => String(record.id) === shapeId)) {
          if (!textEditSessions.has(shapeId)) {
            const traceId = createWhiteboardUuid()
            textEditSessions.set(shapeId, { traceId, shapeId, finalCount: 0 })
            if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_EDIT_STARTED', { traceId, eventId: undefined, boardId, shapeId, sequence: undefined, socketId: socket.id, clientId })
          }
          if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_LOCAL_UPDATE_HELD', { boardId, shapeId, changedFields: getTextDiff(before, after) })
          return
        }
        immediateUpdated.push({ before, after })
      }
    })
    if (normalAdded.length || immediateUpdated.length || removed.length) emitMutation(normalAdded, immediateUpdated, removed)
  }
  const emitTextFinal = (shape: RecordValue, session: { traceId: string; shapeId: string; finalCount: number } | undefined) => {
    if (!isTextShapeRecord(shape) || !session || session.finalCount > 0) return
    const accessRole = callbacks.getAccessRole?.()
    if (!transportConnected || joinedBoardId !== boardId || (accessRole !== 'owner' && accessRole !== 'editor')) return
    const shapeId = String(shape.id)
    const sequence = (nextTextSequence.get(shapeId) ?? 0) + 1
    nextTextSequence.set(shapeId, sequence)
    const eventId = createWhiteboardUuid()
    const trace = { traceId: session.traceId, eventId, boardId, shapeId, sequence, socketId: socket.id, clientId }
    if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_EDIT_ENDED', trace)
    if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_CREATED', { ...trace, record: { id: shape.id, type: shape.type, parentId: shape.parentId, x: shape.x, y: shape.y, w: (shape.props as Record<string, unknown>)?.w, h: (shape.props as Record<string, unknown>)?.h, richTextPresent: Boolean((shape.props as Record<string, unknown>)?.richText) } })
    seen.add(eventId)
    socket.emit('whiteboard:text-final', { protocolVersion: 1, boardId, clientId, eventId, traceId: session.traceId, shapeId, sequence, record: shape } satisfies TextFinalPayload)
    session.finalCount += 1
    if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_EMIT', { ...trace, finalCount: session.finalCount })
  }

  if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] EDITOR_REGISTERED', { boardId, editorPresent: Boolean(editor), editorIdOrStableRef: editor })
  let previousEditingShapeId: string | null = editingShapeId()
  const onSessionChange = () => {
    const currentEditingShapeId = editingShapeId()
    const existingSession = currentEditingShapeId ? textEditSessions.get(currentEditingShapeId) : undefined
    if (!previousEditingShapeId && currentEditingShapeId && (!existingSession || existingSession.finalCount > 0)) {
      const traceId = createWhiteboardUuid()
      textEditSessions.set(currentEditingShapeId, { traceId, shapeId: currentEditingShapeId, finalCount: 0 })
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_EDIT_STARTED', { traceId, eventId: undefined, boardId, shapeId: currentEditingShapeId, sequence: undefined, socketId: socket.id, clientId })
    }
    if (previousEditingShapeId && previousEditingShapeId !== currentEditingShapeId) {
      const session = textEditSessions.get(previousEditingShapeId)
      if (session?.finalCount) {
        if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_DUPLICATE_IGNORED', { boardId, shapeId: previousEditingShapeId, traceId: session.traceId, finalCount: session.finalCount })
        previousEditingShapeId = currentEditingShapeId
        return
      }
      const shape = getActiveEditor()?.store.get(previousEditingShapeId as never) as RecordValue | undefined
      if (shape) {
        emitTextFinal(shape, session)
      }
    }
    previousEditingShapeId = currentEditingShapeId
  }
  const onStoreEvent = (entry: { changes: { added: Record<string, RecordValue>; updated: Record<string, [RecordValue, RecordValue]>; removed: Record<string, RecordValue> }; source?: string; scope?: string }) => {
    const endedShapeId = previousEditingShapeId && previousEditingShapeId !== editingShapeId() ? previousEditingShapeId : null
    onSessionChange()
    if (!entry.scope || entry.scope === 'document') onChange(entry, endedShapeId)
  }
  const unlisten = editor.store.listen(onStoreEvent as never)
  const performanceApi = (editor as Editor & { performance?: { on?: (event: string, callback: (value: { name: string; path: string }) => void) => () => void } }).performance
  const unlistenTransformStart = performanceApi?.on?.('interaction-start', (event) => {
    if (!isTransformInteraction(event.name, event.path) || activeTransform) return
    const selected = getActiveEditor()?.getSelectedShapeIds?.() ?? []
    activeTransform = { interactionId: createWhiteboardUuid(), name: event.name, path: event.path, shapeIds: new Set(selected.map(String)), pending: new Map() }
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] TRANSFORM_STARTED', { boardId, clientId, socketId: socket.id, interactionId: activeTransform.interactionId, name: event.name, path: event.path, shapeIds: [...activeTransform.shapeIds] })
  })
  const unlistenTransformEnd = performanceApi?.on?.('interaction-end', (event) => {
    if (!activeTransform || event.path !== activeTransform.path) return
    endTransform()
  })
  if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] LISTENER_ATTACH', { boardId, handlerId: `realtime-${clientId}`, activeStoreListeners: 1, activeSocketMutationListeners: 1, activeTextContentListeners: 0, activeTextFinalListeners: 1 })
  if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] STORE_LISTENER_ATTACHED', { boardId, editorInstanceId, editorPresent: Boolean(editor) })
  socket.on('connect', () => { transportConnected = true; reportLifecycle('SOCKET_CONNECT'); emitStatus('connecting'); const joinPayload = { boardId, loadedRevision: serverRevision }; if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] CLIENT_JOIN_PAYLOAD', { boardId: joinPayload.boardId, token: { present: Boolean(accessToken), typeof: typeof accessToken, length: accessToken.length }, payloadKeys: Object.keys(joinPayload), payloadTypes: Object.fromEntries(Object.entries(joinPayload).map(([key, value]) => [key, typeof value])) }); reportLifecycle('BOARD_JOIN_REQUEST'); socket.emit('whiteboard:join', joinPayload, (ack: { accepted?: boolean; boardId?: string; serverRevision?: number; reason?: string }) => { if (ack?.accepted && ack.boardId === boardId) { joinedBoardId = boardId; serverRevision = ack.serverRevision ?? serverRevision; emitStatus('connected'); reportLifecycle('BOARD_JOIN_ACK'); socket.emit('whiteboard:ping', { boardId }, (pong: { ok?: boolean; socketId?: string; boardId?: string; reason?: string }) => { if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] BOARD_PING_ACK', { url: socketUrl, namespace: '/whiteboards', path: '/socket.io', boardId, ...socketState(), pong }) }) } else { reportLifecycle('BOARD_JOIN_ERROR', { error: JSON.stringify(ack) }); emitStatus('offline') } }) })
  socket.on('connect_error', (error) => { reportLifecycle('SOCKET_CONNECT_ERROR', { error: `${error.message}${(error as Error & { data?: unknown }).data ? ` | ${JSON.stringify((error as Error & { data?: unknown }).data)}` : ''}` }); emitStatus('offline') })
  socket.on('reconnect_attempt', () => emitStatus('reconnecting'))
  socket.on('disconnect', (reason) => { transportConnected = false; joinedBoardId = null; reportLifecycle('SOCKET_DISCONNECT', { disconnectReason: reason }); emitStatus('offline') })
  socket.on('whiteboard:joined', (value: { boardId?: string; serverRevision?: number }) => { if (value.boardId === boardId) { joinedBoardId = boardId; serverRevision = value.serverRevision ?? serverRevision; emitStatus('connected'); if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] BOARD_JOIN_ACK', { boardId, socketId: socket.id, connected: socket.connected, accessRole: callbacks.getAccessRole?.(), namespace: '/whiteboards', serverRevision }) } })
  socket.on('whiteboard:mutation-accepted', (value: { serverRevision?: number; eventId?: string }) => { serverRevision = value.serverRevision ?? serverRevision; if (value.eventId) seen.add(value.eventId) })
  socket.on('whiteboard:text-final-accepted', (value: { serverRevision?: number; eventId?: string }) => { serverRevision = value.serverRevision ?? serverRevision; if (value.eventId) seenTextFinalEvents.add(value.eventId) })
  socket.on('whiteboard:reload-required', (value: { traceId?: string; serverRevision?: number }) => { serverRevision = value.serverRevision ?? serverRevision; callbacks.onReloadRequired?.(value.traceId) })
  socket.on('whiteboard:mutation-rejected', (value: { reason?: string; eventId?: string }) => {
    // A generic forbidden mutation can be a viewer or stale-role rejection.
    // Only an explicit revocation means the board membership is gone.
    if (value.reason === 'access_revoked') emitStatus('access-lost')
  })
  socket.on('whiteboard:mutation', (envelope: { traceId?: string; eventId: string; serverRevision?: number; payload: { added?: RecordValue[]; updated?: UpdatedRecord[]; removed?: RecordValue[] } }) => {
    if (seen.has(envelope.eventId)) return
    seen.add(envelope.eventId)
    serverRevision = envelope.serverRevision ?? serverRevision
    const payload = envelope.payload
    const added = payload.added ?? []
    const updated = payload.updated ?? []
    const removed = payload.removed ?? []
    const traceId = envelope.traceId ?? envelope.eventId
    const illegalTextUpdates = updated.filter((change) => isTextShapeRecord(change.after))
    if (illegalTextUpdates.length && import.meta.env.DEV) console.error('[WhiteboardTextTrace] ILLEGAL_TEXT_IN_NORMAL_MUTATION', { boardId, eventId: envelope.eventId, shapeIds: illegalTextUpdates.map((change) => change.after.id) })
    const acceptedUpdated = updated.filter((change) => !isTextShapeRecord(change.after))
    const visibleEditor = getActiveEditor()
    const remoteApplyEditor = visibleEditor
    const visibleEditorInstanceId = callbacks.getVisibleEditorInstanceId?.() ?? callbacks.getEditorInstanceId?.() ?? editorInstanceId
    const activeEditorInstanceId = callbacks.getEditorInstanceId?.() ?? editorInstanceId
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] REMOTE_RECEIVE', { traceId, eventId: envelope.eventId, boardId, socketId: socket.id, editorInstanceId: activeEditorInstanceId, visibleEditorInstanceId, sameInstance: remoteApplyEditor === visibleEditor, serverRevision: envelope.serverRevision, addedIds: added.map((record) => record.id), updatedIds: updated.map((change) => change.after.id), removedIds: removed.map((record) => record.id) })
    if (!remoteApplyEditor) return
    applyingRemote = true
    try {
      if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] REMOTE_APPLY_BEGIN', { traceId, eventId: envelope.eventId, boardId, socketId: socket.id, editorInstanceId: activeEditorInstanceId, visibleEditorInstanceId, sameInstance: remoteApplyEditor === visibleEditor, serverRevision: envelope.serverRevision })
      const updatedRecords = acceptedUpdated.map((change) => change.after)
      const allAdded = [...added, ...updatedRecords]
      const orderedTypeNames = ['page', 'asset', 'shape', 'binding']
      const recordsByType = (typeName: string) => allAdded.filter((record) => record.typeName === typeName)
      remoteApplyEditor.store.mergeRemoteChanges(() => {
        for (const typeName of orderedTypeNames) {
          const records = recordsByType(typeName)
          if (records.length) {
            records.forEach((record) => traceTextStoreWrite(record, 'remote-normal-mutation', undefined, editingShapeId()))
            remoteApplyEditor.store.put(records as never)
          }
        }
        const otherRecords = allAdded.filter((record) => !orderedTypeNames.includes(String(record.typeName)))
        if (otherRecords.length) remoteApplyEditor.store.put(otherRecords as never)
        remoteApplyEditor.store.remove(removed.map((record) => String(record.id)) as never)
      })
      if (import.meta.env.DEV) {
        const ids = [...added, ...acceptedUpdated.map((change) => change.after)]
        console.error('[WhiteboardRealtimeTrace] REMOTE_APPLY_END', { traceId, eventId: envelope.eventId, boardId, socketId: socket.id, editorInstanceId: activeEditorInstanceId, visibleEditorInstanceId, sameInstance: remoteApplyEditor === visibleEditor, serverRevision: envelope.serverRevision, records: ids.map((record) => ({ id: record.id, present: Boolean(remoteApplyEditor.store.get(String(record.id) as never)) })) })
        const currentPageId = remoteApplyEditor.getCurrentPageId()
        const currentPageShapeIds = remoteApplyEditor.getCurrentPageShapeIds()
        for (const record of ids.filter((value) => value.typeName === 'shape')) {
          const shape = remoteApplyEditor.store.get(String(record.id) as never) as { parentId?: string } | undefined
          console.error('[WhiteboardRealtimeTrace] REMOTE_VISIBLE_STORE_CONFIRMED', { recordId: record.id, existsInStore: Boolean(shape), currentPageId, recordParentId: shape?.parentId, visibleOnCurrentPage: currentPageShapeIds.has(record.id as never) })
        }
      }
    } finally { applyingRemote = false }
    latestAppliedRealtimeRevision = envelope.serverRevision ?? serverRevision
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] REMOTE_REVISION_UPDATED', { traceId, eventId: envelope.eventId, boardId, socketId: socket.id, serverRevision: envelope.serverRevision, localAppliedRevision: latestAppliedRealtimeRevision, latestServerRevision: serverRevision, loadedRevision: 0 })
    callbacks.onRemotePatch?.(latestAppliedRealtimeRevision, traceId)
  })
  socket.on('whiteboard:text-final', (payload: TextFinalPayload) => {
    const trace = { traceId: payload?.traceId, eventId: payload?.eventId, boardId: payload?.boardId, shapeId: payload?.shapeId, sequence: payload?.sequence, socketId: socket.id, clientId: payload?.clientId }
    if (payload?.protocolVersion !== 1 || payload.boardId !== boardId || typeof payload.eventId !== 'string' || typeof payload.traceId !== 'string' || seenTextFinalEvents.has(`${boardId}:${payload.shapeId}:${payload.eventId}`) || payload.shapeId !== payload.record?.id || !isTextShapeRecord(payload.record) || typeof payload.sequence !== 'number') return
    if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_REMOTE_RECEIVE', trace)
    const lastSequence = lastAppliedTextSequence.get(payload.shapeId) ?? 0
    if (payload.sequence <= lastSequence) {
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_STALE_IGNORED', { boardId, shapeId: payload.shapeId, sequence: payload.sequence, lastSequence })
      return
    }
    const targetEditor = getActiveEditor()
    const parentId = payload.record.parentId
    const parent = typeof parentId === 'string' ? targetEditor?.store.get(parentId as never) as RecordValue | undefined : undefined
    if (!targetEditor || !parent || parent.typeName !== 'page') {
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_REMOTE_REJECTED', { ...trace, reason: 'invalid_parent', currentPageId: targetEditor?.getCurrentPageId?.(), pageExists: Boolean(parent), recordParentId: parentId })
      return
    }
    seenTextFinalEvents.add(`${boardId}:${payload.shapeId}:${payload.eventId}`)
    lastAppliedTextSequence.set(payload.shapeId, payload.sequence)
    applyingRemote = true
    try {
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_REMOTE_APPLY_BEGIN', trace)
      traceTextStoreWrite(payload.record, 'remote-text-final', payload.sequence, editingShapeId())
      targetEditor.store.mergeRemoteChanges(() => targetEditor.store.put([payload.record] as never))
      callbacks.onRemotePatch?.(serverRevision, payload.eventId)
      const stored = targetEditor.store.get(payload.shapeId as never) as RecordValue | undefined
      const currentPageId = targetEditor.getCurrentPageId()
      const visibleOnCurrentPage = targetEditor.getCurrentPageShapeIds().has(payload.shapeId as never)
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_REMOTE_APPLY_END', { ...trace, editorInstanceId, currentPageId, recordParentId: payload.record.parentId, pageExists: Boolean(parent), visibleOnCurrentPage })
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] TEXT_FINAL_STORE_CONFIRMED', { ...trace, existsInStore: Boolean(stored), currentPageId, recordParentId: payload.record.parentId, pageExists: Boolean(parent), visibleOnCurrentPage })
    } finally {
      applyingRemote = false
    }
  })
  socket.on('whiteboard:transform', (payload: TransformPayload) => {
    if (payload?.protocolVersion !== 1 || payload.boardId !== boardId || typeof payload.shapeId !== 'string' || payload.shapeId !== payload.record?.id || typeof payload.interactionId !== 'string' || typeof payload.sequence !== 'number' || !transformRecord(payload.record)) return
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] TRANSFORM_REMOTE_RECEIVED', { boardId, clientId, socketId: socket.id, interactionId: payload.interactionId, shapeId: payload.shapeId, sequence: payload.sequence, final: payload.final })
    const previous = lastAppliedTransform.get(payload.shapeId)
    if (previous && (previous.final || payload.sequence <= previous.sequence)) {
      if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] TRANSFORM_STALE_IGNORED', { boardId, shapeId: payload.shapeId, interactionId: payload.interactionId, sequence: payload.sequence, previous })
      return
    }
    const targetEditor = getActiveEditor()
    if (!targetEditor || !targetEditor.store.get(payload.record.parentId as never)) return
    applyingRemote = true
    try {
      if (import.meta.env.DEV) console.error(`[WhiteboardRealtimeTrace] ${payload.final ? 'TRANSFORM_FINAL_APPLIED' : 'TRANSFORM_REMOTE_APPLIED'}`, { boardId, clientId, socketId: socket.id, interactionId: payload.interactionId, shapeId: payload.shapeId, sequence: payload.sequence })
      targetEditor.store.mergeRemoteChanges(() => targetEditor.store.put([payload.record] as never))
      lastAppliedTransform.set(payload.shapeId, { interactionId: payload.interactionId, sequence: payload.sequence, final: payload.final })
    } finally { applyingRemote = false }
  })
  socket.on('whiteboard:debug-message', (value: { boardId?: string; message?: string; traceId?: string; senderSocketId?: string }) => {
    if (value.boardId !== boardId || typeof value.message !== 'string' || typeof value.traceId !== 'string') return
    callbacks.onDebugMessage?.({ boardId, message: value.message, traceId: value.traceId, senderSocketId: value.senderSocketId })
  })
  socket.on('whiteboard:debug-synthetic', (value: { boardId?: string; traceId?: string; shape?: RecordValue; senderSocketId?: string }) => {
    if (value.boardId !== boardId || typeof value.traceId !== 'string' || !value.shape) return
    const activeEditor = getActiveEditor()
    const shapeId = value.shape.id
    if (!activeEditor || typeof shapeId !== 'string') return
    applyingRemote = true
    try {
      activeEditor.createShape(value.shape as never)
      callbacks.onDebugSynthetic?.(shapeId, value.traceId)
    } finally {
      applyingRemote = false
    }
  })
  callbacks.onDebugApi?.({
    socketId: () => socket.id,
    sendDebugMessage: (message) => {
      const traceId = createWhiteboardUuid()
      socket.emit('whiteboard:debug-message', { boardId, message, traceId })
      return traceId
    },
    sendSyntheticRectangle: () => {
      const traceId = createWhiteboardUuid()
      const shapeId = `shape:${createWhiteboardUuid()}`
      socket.emit('whiteboard:debug-synthetic', { boardId, traceId, shape: { id: shapeId, type: 'geo', x: 0, y: 0, props: { geo: 'rectangle', w: 240, h: 160, color: 'blue', fill: 'none', dash: 'draw', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: '' } } })
      return traceId
    },
  })
  emitStatus('connecting')
  reportLifecycle('SOCKET_CONNECT_CALL')
  socket.connect()
  return () => { callbacks.onDebugApi?.(null); if (transformFlushTimer) clearTimeout(transformFlushTimer); endTransform(); unlistenTransformStart?.(); unlistenTransformEnd?.(); textEditSessions.clear(); if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] LISTENER_DETACH', { boardId, handlerId: `realtime-${clientId}`, activeStoreListeners: 0, activeSocketMutationListeners: 0, activeTextContentListeners: 0, activeTextFinalListeners: 0 }); if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] SOCKET_CLEANUP_DISCONNECT', { url: socketUrl, namespace: '/whiteboards', path: '/socket.io', boardId, ...socketState() }); if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] STORE_LISTENER_DETACHED', { boardId, editorPresent: Boolean(editor), editorInstanceId }); unlisten(); if (socket.connected || socket.active) socket.emit('whiteboard:leave', { boardId }); socket.disconnect() }
}
