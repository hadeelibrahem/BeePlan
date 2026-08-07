import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWhiteboardAutosave } from './useWhiteboardAutosave'

describe('useWhiteboardAutosave', () => {
  beforeEach(() => vi.useFakeTimers())

  it('debounces rapid editor changes into one save', async () => {
    const listeners: Array<() => void> = []
    const editor = {
      getSnapshot: vi.fn(() => ({ document: { shapes: [] }, session: {} })),
      getCamera: vi.fn(() => ({ x: 0, y: 0, z: 1 })),
      store: { listen: vi.fn((listener: () => void) => { listeners.push(listener); return () => undefined }) },
    } as never
    const save = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useWhiteboardAutosave({ editor, enabled: true, save }))

    act(() => {
      listeners[0]()
      listeners[0]()
      vi.advanceTimersByTime(999)
    })
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledOnce()
  })

  it('persists a later change after the first request completes', async () => {
    const listeners: Array<() => void> = []
    let resolveFirst!: () => void
    const editor = {
      getSnapshot: vi.fn()
        .mockReturnValueOnce({ document: { shapes: ['a'] }, session: {} })
        .mockReturnValue({ document: { shapes: ['b'] }, session: {} }),
      getCamera: vi.fn(() => ({ x: 0, y: 0, z: 1 })),
      store: { listen: vi.fn((listener: () => void) => { listeners.push(listener); return () => undefined }) },
    } as never
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValue(undefined)
    renderHook(() => useWhiteboardAutosave({ editor, enabled: true, save }))

    act(() => { listeners[0](); vi.advanceTimersByTime(1000) })
    act(() => { listeners[0](); vi.advanceTimersByTime(1000) })
    expect(save).toHaveBeenCalledOnce()

    await act(async () => {
      resolveFirst()
      await Promise.resolve()
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('keeps failed content available and retries the latest snapshot', async () => {
    const listeners: Array<() => void> = []
    const editor = {
      getSnapshot: vi.fn(() => ({ document: { shapes: ['latest'] }, session: {} })),
      getCamera: vi.fn(() => ({ x: 1, y: 2, z: 1 })),
      store: { listen: vi.fn((listener: () => void) => { listeners.push(listener); return () => undefined }) },
    } as never
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { result } = renderHook(() => useWhiteboardAutosave({ editor, enabled: true, save }))

    act(() => { listeners[0](); vi.advanceTimersByTime(1000) })
    await act(async () => { await Promise.resolve() })
    expect(result.current.status).toBe('failed')

    await act(async () => {
      result.current.retry()
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('attaches after restoration gating opens and stays active for later edits', async () => {
    const listeners: Array<() => void> = []
    const editor = {
      getSnapshot: vi.fn(() => ({ document: { store: {} }, session: {} })),
      getCamera: vi.fn(() => ({ x: 0, y: 0, z: 1 })),
      store: { listen: vi.fn((listener: () => void) => { listeners.push(listener); return () => undefined }) },
    } as never
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ enabled }) => useWhiteboardAutosave({ editor, enabled, save }), { initialProps: { enabled: false } })
    expect(editor.store.listen).not.toHaveBeenCalled()
    rerender({ enabled: true })
    expect(editor.store.listen).toHaveBeenCalledOnce()
    act(() => { listeners[0](); vi.advanceTimersByTime(1000) })
    await act(async () => { await Promise.resolve() })
    expect(save).toHaveBeenCalledOnce()
  })

  it('reads the latest asset mapping through the getter when saving', async () => {
    const listeners: Array<() => void> = []
    const mapping = { current: {} as Record<string, { tldrawAssetId: string; beeplanAssetId: string; stableResolverUrl: string }> }
    const editor = {
      getSnapshot: vi.fn(() => ({ document: { store: {} }, session: {} })),
      getCamera: vi.fn(() => ({ x: 0, y: 0, z: 1 })),
      store: { listen: vi.fn((listener: () => void) => { listeners.push(listener); return () => undefined }) },
    } as never
    const save = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useWhiteboardAutosave({ editor, enabled: true, save, getAssetReferences: () => mapping.current }))

    mapping.current = { 'asset:1': { tldrawAssetId: 'asset:1', beeplanAssetId: 'backend-1', stableResolverUrl: 'http://127.0.0.1:3000/whiteboard/assets/backend-1/file' } }
    act(() => { listeners[0](); vi.advanceTimersByTime(1000) })
    await act(async () => { await Promise.resolve() })
    expect(save.mock.calls[0]?.[0].assetReferences).toEqual(mapping.current)
  })
})
