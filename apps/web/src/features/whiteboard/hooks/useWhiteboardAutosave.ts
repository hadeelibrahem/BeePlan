import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import type { WhiteboardAssetReferences, WhiteboardUpdate } from '../api/whiteboardApi'
import { TEXT_SYNC_ISOLATION_MODE } from '../whiteboardRealtime'

export type WhiteboardSaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed'

type UseWhiteboardAutosaveOptions = {
  editor: Editor | null
  enabled: boolean
  save: (payload: WhiteboardUpdate) => Promise<unknown>
  getAssetReferences?: () => WhiteboardAssetReferences
  assetReferencesRef?: { current: WhiteboardAssetReferences }
  isTextEditing?: () => boolean
}

type PendingSave = {
  payload: WhiteboardUpdate
  version: number
}

const DEBOUNCE_MS = 1000

export function useWhiteboardAutosave({ editor, enabled, save, getAssetReferences, assetReferencesRef, isTextEditing }: UseWhiteboardAutosaveOptions) {
  const [status, setStatus] = useState<WhiteboardSaveStatus>('idle')
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<PendingSave | null>(null)
  const inFlightRef = useRef(false)
  const versionRef = useRef(0)
  const lastSerializedRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const flushRef = useRef<() => void>(() => undefined)

  const capture = useCallback((): WhiteboardUpdate | null => {
    if (!editor) return null
    if (TEXT_SYNC_ISOLATION_MODE && isTextEditing?.()) {
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] HTTP_SNAPSHOT_BLOCKED_ISOLATION', { reason: 'active-text-editing' })
      return null
    }
    const camera = editor.getCamera()
    const snapshot = editor.getSnapshot()
    const latestAssetReferences = getAssetReferences?.() ?? assetReferencesRef?.current ?? {}
    if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] autosave getter', { assetReferencesOwner: Boolean(getAssetReferences), assetReferences: latestAssetReferences, camera: { x: camera.x, y: camera.y, zoom: camera.z }, snapshot })
    return {
      snapshot,
      assetReferences: latestAssetReferences,
      camera: { x: camera.x, y: camera.y, zoom: camera.z },
    }
  }, [assetReferencesRef, editor, getAssetReferences, isTextEditing])

  const flush = useCallback(async () => {
    if (inFlightRef.current || !pendingRef.current) return

    const pending = pendingRef.current
    inFlightRef.current = true
    if (mountedRef.current) setStatus('saving')

    try {
      await save(pending.payload)
      if (!mountedRef.current) return

      if (pendingRef.current?.version === pending.version) {
        pendingRef.current = null
        setStatus('saved')
      } else {
        setStatus('unsaved')
        window.setTimeout(() => flushRef.current(), 0)
      }
    } catch {
      if (mountedRef.current) setStatus('failed')
    } finally {
      inFlightRef.current = false
    }
  }, [save])

  flushRef.current = () => void flush()

  const schedule = useCallback(() => {
    const payload = capture()
    if (!payload) return

    const serialized = JSON.stringify(payload)
    if (serialized === lastSerializedRef.current) return
    lastSerializedRef.current = serialized

    const pending = { payload, version: versionRef.current + 1 }
    versionRef.current = pending.version
    pendingRef.current = pending
    if (mountedRef.current) setStatus('unsaved')

    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      flushRef.current()
    }, DEBOUNCE_MS)
  }, [capture])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled || !editor) return

    const removeListener = editor.store.listen(
      (entry) => { if (entry?.source === 'remote') return; schedule() },
      { source: 'user', scope: 'document' },
    )
    const handlePageHide = () => flushRef.current()
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      removeListener()
      window.removeEventListener('pagehide', handlePageHide)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      pendingRef.current = null
      mountedRef.current = false
    }
  }, [editor, enabled, schedule])

  const retry = useCallback(() => {
    if (!editor) return
    lastSerializedRef.current = null
    schedule()
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      flushRef.current()
    }, 0)
  }, [editor, schedule])

  return { status, retry, schedule }
}
