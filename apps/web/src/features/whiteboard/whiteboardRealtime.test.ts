import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectWhiteboardRealtime, getLocalTextGeometryChanges, shouldDisableWhiteboardRealtime } from './whiteboardRealtime'

const boardId = '11111111-1111-4111-8111-111111111111'
const socketState = vi.hoisted(() => ({ socket: null as null | { id: string; connected: boolean; active: boolean; disconnected: boolean; io: { uri: string; opts: Record<string, unknown> }; on: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn>; volatile: { emit: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } }))
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socketState.socket) }))

function connect(editor: Record<string, unknown>, role: 'owner' | 'editor' | 'viewer' = 'owner') {
  const cleanup = connectWhiteboardRealtime('token', boardId, editor as never, { getAccessRole: () => role })
  const connectHandler = socketState.socket?.on.mock.calls.find(([event]) => event === 'connect')?.[1] as (() => void) | undefined
  connectHandler?.()
  const joinCall = socketState.socket?.emit.mock.calls.find(([event]) => event === 'whiteboard:join')
  const joinAck = joinCall?.[2] as ((ack: { accepted: boolean; boardId: string; serverRevision: number }) => void) | undefined
  joinAck?.({ accepted: true, boardId, serverRevision: 1 })
  return cleanup
}

function shape(id: string, text: string, x = 10) {
  return { id, typeName: 'shape', type: 'text', parentId: 'page:1', x, y: 20, props: { richText: text, w: 120, growY: 30 } }
}

describe('whiteboard final-text realtime bridge', () => {
  beforeEach(() => {
    socketState.socket = { id: 'socket-1', connected: true, active: true, disconnected: false, io: { uri: 'http://127.0.0.1:3000', opts: { path: '/socket.io', autoConnect: false } }, on: vi.fn(), emit: vi.fn(), volatile: { emit: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
    let id = 0
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${++id}`) })
  })

  it('recognizes the development realtime-disable switch', () => {
    expect(shouldDisableWhiteboardRealtime({ DEV: true, VITE_WHITEBOARD_DISABLE_REALTIME: 'true' })).toBe(true)
    expect(shouldDisableWhiteboardRealtime({ DEV: true, VITE_WHITEBOARD_DISABLE_REALTIME: 'false' })).toBe(false)
    expect(shouldDisableWhiteboardRealtime({ DEV: false, VITE_WHITEBOARD_DISABLE_REALTIME: 'true' })).toBe(false)
  })

  it('connects when randomUUID is unavailable but getRandomValues exists', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => { bytes.fill(7); return bytes } })
    const cleanup = connect({ getEditingShapeId: vi.fn(() => null), store: { listen: vi.fn(() => vi.fn()) } })
    expect(socketState.socket?.connect).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('reports local text geometry changes without changing the editor geometry', () => {
    const before = shape('shape:text', 'a', 10)
    const after = { ...shape('shape:text', 'ab', 10), props: { ...shape('shape:text', 'ab', 10).props, growY: 48 } }
    expect(getLocalTextGeometryChanges(before, after)).toEqual({ growY: 48, richText: '[changed]' })
  })

  it('keeps the active text shape out of normal patches while unrelated shapes remain immediate', () => {
    let listener: ((entry: unknown) => void) | undefined
    const editor = { getEditingShapeId: vi.fn(() => 'shape:text'), store: { listen: vi.fn((callback: (entry: unknown) => void) => { listener = callback; return vi.fn() }) } }
    const cleanup = connect(editor)
    listener?.({ scope: 'document', changes: { added: {}, removed: {}, updated: { 'shape:text': [shape('shape:text', 'a'), shape('shape:text', 'ab')], 'shape:geo': [{ id: 'shape:geo', typeName: 'shape', type: 'geo' }, { id: 'shape:geo', typeName: 'shape', type: 'geo', x: 2 }] } } })
    const mutation = socketState.socket?.emit.mock.calls.find(([event]) => event === 'whiteboard:mutation')
    expect(mutation?.[1]).toEqual(expect.objectContaining({ payload: { added: [], removed: [], updated: [{ before: { id: 'shape:geo', typeName: 'shape', type: 'geo' }, after: { id: 'shape:geo', typeName: 'shape', type: 'geo', x: 2 } }] } }))
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:text-final')).toBe(false)
    cleanup()
  })

  it('emits exactly one final record when editing ends and none while typing', () => {
    let listener: ((entry: unknown) => void) | undefined
    let editing: string | null = null
    const records = new Map<string, Record<string, unknown>>([['page:1', { id: 'page:1', typeName: 'page' }], ['shape:text', shape('shape:text', 'final', 22)]])
    const editor = { getEditingShapeId: vi.fn(() => editing), store: { listen: vi.fn((callback: (entry: unknown) => void) => { listener = callback; return vi.fn() }), get: vi.fn((id: string) => records.get(id)) } }
    const cleanup = connect(editor)
    editing = 'shape:text'
    listener?.({ scope: 'session', changes: { added: {}, updated: {}, removed: {} } })
    listener?.({ scope: 'document', changes: { added: {}, removed: {}, updated: { 'shape:text': [shape('shape:text', 'a'), shape('shape:text', 'final', 22)] } } })
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:text-final')).toBe(false)
    editing = null
    listener?.({ scope: 'session', changes: { added: {}, updated: {}, removed: {} } })
    listener?.({ scope: 'session', changes: { added: {}, updated: {}, removed: {} } })
    const finals = socketState.socket?.emit.mock.calls.filter(([event]) => event === 'whiteboard:text-final') ?? []
    expect(finals).toHaveLength(1)
    expect(finals[0][1]).toEqual(expect.objectContaining({ shapeId: 'shape:text', sequence: 1, record: shape('shape:text', 'final', 22) }))
    cleanup()
  })

  it('emits a complete final event for a newly created text shape on blur', () => {
    let listener: ((entry: unknown) => void) | undefined
    let editing: string | null = 'shape:new'
    const created = shape('shape:new', 'BeePlan Test', 30)
    const editor = { getEditingShapeId: vi.fn(() => editing), store: { listen: vi.fn((callback: (entry: unknown) => void) => { listener = callback; return vi.fn() }), get: vi.fn(() => created) } }
    const cleanup = connect(editor)
    listener?.({ scope: 'document', changes: { added: { 'shape:new': created }, updated: {}, removed: {} } })
    editing = null
    listener?.({ scope: 'document', changes: { added: {}, updated: { 'shape:new': [shape('shape:new', ''), created] }, removed: {} } })
    const finals = socketState.socket?.emit.mock.calls.filter(([event]) => event === 'whiteboard:text-final') ?? []
    expect(finals).toHaveLength(1)
    expect(finals[0][1]).toEqual(expect.objectContaining({ shapeId: 'shape:new', sequence: 1, record: created }))
    cleanup()
  })

  it('finalizes shape A once when switching directly to shape B', () => {
    let listener: ((entry: unknown) => void) | undefined
    let editing: string | null = null
    const records = new Map<string, Record<string, unknown>>([['page:1', { id: 'page:1', typeName: 'page' }], ['shape:a', shape('shape:a', 'A')], ['shape:b', shape('shape:b', 'B')]])
    const editor = { getEditingShapeId: vi.fn(() => editing), store: { listen: vi.fn((callback: (entry: unknown) => void) => { listener = callback; return vi.fn() }), get: vi.fn((id: string) => records.get(id)) } }
    const cleanup = connect(editor)
    editing = 'shape:a'; listener?.({ scope: 'session', changes: { added: {}, updated: {}, removed: {} } })
    editing = 'shape:b'; listener?.({ scope: 'session', changes: { added: {}, updated: {}, removed: {} } })
    expect(socketState.socket?.emit.mock.calls.filter(([event]) => event === 'whiteboard:text-final')).toHaveLength(1)
    expect(socketState.socket?.emit.mock.calls.find(([event]) => event === 'whiteboard:text-final')?.[1]).toEqual(expect.objectContaining({ shapeId: 'shape:a' }))
    cleanup()
  })

  it('applies a remote final once, preserves the ID, and does not rebroadcast or autosave it', () => {
    const records = new Map<string, Record<string, unknown>>([['page:1', { id: 'page:1', typeName: 'page' }]])
    const put = vi.fn((items: Array<Record<string, unknown>>) => items.forEach((item) => records.set(String(item.id), item)))
    const editor = { getEditingShapeId: vi.fn(() => null), getCurrentPageId: vi.fn(() => 'page:1'), getCurrentPageShapeIds: vi.fn(() => new Set()), store: { listen: vi.fn(() => vi.fn()), get: vi.fn((id: string) => records.get(id)), put, remove: vi.fn(), mergeRemoteChanges: vi.fn((callback: () => void) => callback()) } }
    const cleanup = connect(editor, 'viewer')
    const handler = socketState.socket?.on.mock.calls.find(([event]) => event === 'whiteboard:text-final')?.[1] as ((payload: unknown) => void) | undefined
    const payload = { protocolVersion: 1, boardId, clientId: 'peer', eventId: 'final-1', traceId: 'trace-final-1', shapeId: 'shape:text', sequence: 1, record: shape('shape:text', 'remote', 55) }
    handler?.(payload); handler?.(payload)
    expect(put).toHaveBeenCalledTimes(1)
    expect(records.get('shape:text')).toEqual(payload.record)
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:text-final')).toBe(false)
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:mutation')).toBe(false)
    cleanup()
  })

  it('rejects text updates received through the normal mutation channel', () => {
    const records = new Map<string, Record<string, unknown>>([['page:1', { id: 'page:1', typeName: 'page' }]])
    const put = vi.fn((items: Array<Record<string, unknown>>) => items.forEach((item) => records.set(String(item.id), item)))
    const editor = { getEditingShapeId: vi.fn(() => null), getCurrentPageId: vi.fn(() => 'page:1'), getCurrentPageShapeIds: vi.fn(() => new Set()), store: { listen: vi.fn(() => vi.fn()), get: vi.fn((id: string) => records.get(id)), put, remove: vi.fn(), mergeRemoteChanges: vi.fn((callback: () => void) => callback()) } }
    const cleanup = connect(editor, 'viewer')
    const handler = socketState.socket?.on.mock.calls.find(([event]) => event === 'whiteboard:mutation')?.[1] as ((payload: unknown) => void) | undefined
    handler?.({ eventId: 'normal-text-1', serverRevision: 2, payload: { added: [], removed: [], updated: [{ before: shape('shape:text', 'before'), after: shape('shape:text', 'illegal') }] } })
    expect(put).not.toHaveBeenCalled()
    cleanup()
  })

  it('synchronizes text deletion immediately', () => {
    let listener: ((entry: unknown) => void) | undefined
    let editing: string | null = 'shape:text'
    const editor = { getEditingShapeId: vi.fn(() => editing), store: { listen: vi.fn((callback: (entry: unknown) => void) => { listener = callback; return vi.fn() }), get: vi.fn(() => ({ id: 'page:1', typeName: 'page' })) } }
    const cleanup = connect(editor)
    listener?.({ scope: 'document', changes: { added: {}, updated: {}, removed: { 'shape:text': shape('shape:text', 'gone') } } })
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:mutation')).toBe(true)
    cleanup()
  })

  it('coalesces active transforms and emits one latest final record', () => {
    vi.useFakeTimers()
    let listener: ((entry: unknown) => void) | undefined
    let start: ((event: { name: string; path: string }) => void) | undefined
    let end: ((event: { name: string; path: string }) => void) | undefined
    const geo = (x: number) => ({ id: 'shape:geo', typeName: 'shape', type: 'geo', parentId: 'page:1', x, y: 0, props: { geo: 'rectangle', w: 100, h: 100 } })
    let current = geo(0)
    const editor = { getSelectedShapeIds: vi.fn(() => ['shape:geo']), getEditingShapeId: vi.fn(() => null), store: { listen: vi.fn((callback: (entry: unknown) => void) => { listener = callback; return vi.fn() }), get: vi.fn(() => current) }, performance: { on: vi.fn((event: string, callback: (value: { name: string; path: string }) => void) => { if (event === 'interaction-start') start = callback; if (event === 'interaction-end') end = callback; return vi.fn() }) } }
    const cleanup = connect(editor)
    start?.({ name: 'translating', path: 'select.translating' })
    current = geo(10); listener?.({ scope: 'document', changes: { added: {}, removed: {}, updated: { 'shape:geo': [geo(0), current] } } })
    current = geo(20); listener?.({ scope: 'document', changes: { added: {}, removed: {}, updated: { 'shape:geo': [geo(10), current] } } })
    vi.advanceTimersByTime(33)
    expect(socketState.socket?.volatile.emit).toHaveBeenCalledTimes(1)
    expect(socketState.socket?.volatile.emit.mock.calls[0][1]).toEqual(expect.objectContaining({ shapeId: 'shape:geo', record: current, final: false }))
    end?.({ name: 'translating', path: 'select.translating' })
    const finals = socketState.socket?.emit.mock.calls.filter(([event]) => event === 'whiteboard:transform') ?? []
    expect(finals).toHaveLength(1)
    expect(finals[0][1]).toEqual(expect.objectContaining({ shapeId: 'shape:geo', record: current, final: true, sequence: 2 }))
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:mutation')).toBe(false)
    cleanup(); vi.useRealTimers()
  })

  it('applies only the latest remote transform sequence and does not rebroadcast it', () => {
    const records = new Map<string, Record<string, unknown>>([['page:1', { id: 'page:1', typeName: 'page' }]])
    const put = vi.fn((items: Array<Record<string, unknown>>) => items.forEach((item) => records.set(String(item.id), item)))
    const editor = { getEditingShapeId: vi.fn(() => null), store: { listen: vi.fn(() => vi.fn()), get: vi.fn((id: string) => records.get(id)), put, mergeRemoteChanges: vi.fn((callback: () => void) => callback()) } }
    const cleanup = connect(editor, 'viewer')
    const handler = socketState.socket?.on.mock.calls.find(([event]) => event === 'whiteboard:transform')?.[1] as ((payload: unknown) => void) | undefined
    const record = { id: 'shape:geo', typeName: 'shape', type: 'geo', parentId: 'page:1', props: { geo: 'rectangle' } }
    handler?.({ protocolVersion: 1, boardId, clientId: 'peer', eventId: 'transform-1', interactionId: 'interaction-1', shapeId: 'shape:geo', sequence: 2, final: false, record })
    handler?.({ protocolVersion: 1, boardId, clientId: 'peer', eventId: 'transform-0', interactionId: 'interaction-1', shapeId: 'shape:geo', sequence: 1, final: false, record: { ...record, x: -1 } })
    expect(put).toHaveBeenCalledTimes(1)
    expect(records.get('shape:geo')).toBe(record)
    expect(socketState.socket?.emit.mock.calls.some(([event]) => event === 'whiteboard:mutation')).toBe(false)
    cleanup()
  })
})
