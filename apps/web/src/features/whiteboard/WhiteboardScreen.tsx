import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'
import type { Editor } from 'tldraw'
import { AssetRecordType, createShapeId, createShapesForAssets, type TLAssetId, type TLShapeId } from 'tldraw'
import type { VecLike } from '@tldraw/editor'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { changeTaskStatus, getTasks, isValidTaskId, type ApiTask } from '../../lib/tasksApi'
import { queryKeys } from '../../lib/queryKeys'
import { WhiteboardCanvas } from './WhiteboardCanvas'
import { downloadWhiteboardAsset, getWhiteboardAsset, getWhiteboardTaskCard, leaveWhiteboard, uploadWhiteboardAsset, type WhiteboardAsset, type WhiteboardAssetReference, type WhiteboardAssetReferences, type WhiteboardTaskCard, type WhiteboardUpdate } from './api/whiteboardApi'
import { WhiteboardToolbar } from './WhiteboardToolbar'
import { WhiteboardTaskPicker } from './WhiteboardTaskPicker'
import { WhiteboardTaskProvider } from './WhiteboardTaskContext'
import { BEEPLAN_TASK_SHAPE_TYPE } from './BeePlanTaskShapeUtil'
import { useWhiteboard } from './hooks/useWhiteboard'
import { useWhiteboardAutosave } from './hooks/useWhiteboardAutosave'
import { WhiteboardAssetProvider } from './WhiteboardAssetContext'
import { BEEPLAN_FILE_SHAPE_TYPE } from './BeePlanFileShapeUtil'
import { BEEPLAN_LINK_SHAPE_TYPE } from './BeePlanLinkShapeUtil'
import { WhiteboardLinkDialog } from './WhiteboardLinkDialog'
import { WhiteboardLinkProvider } from './WhiteboardLinkContext'
import { WhiteboardAdvancedControls } from './WhiteboardAdvancedControls'
import { WhiteboardShareDialog } from './WhiteboardShareDialog'
import { normalizeWhiteboardUrl } from './whiteboardLinkUtils'
import { getBeePlanAssetId, normalizeAssetSnapshot, WHITEBOARD_IMAGE_UNAVAILABLE_URL, whiteboardAssetResolverUrl } from './whiteboardSnapshotUtils'
import { assertValidRuntimeImageUrl, createRuntimeImageUrl } from './whiteboardImageRuntime'
import { Expand, Maximize, Minimize } from 'lucide-react'
import { connectWhiteboardRealtime, getLocalTextGeometryChanges, isTextShapeRecord, WHITEBOARD_REALTIME_DISABLED, type WhiteboardRealtimeStatus } from './whiteboardRealtime'
import { createWhiteboardUuid } from './whiteboardUuid'

type WhiteboardScreenProps = {
  boardId?: string
  onOpenTask?: (taskId: string) => void
  onStartFocus?: (task: ApiTask) => Promise<void>
  focusMode?: boolean
  onToggleFocusMode?: () => void
  onLeaveBoard?: () => void
}

function WhiteboardScreenContent({ boardId, onOpenTask, onStartFocus, focusMode = false, onToggleFocusMode, onLeaveBoard }: WhiteboardScreenProps) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const { board, loading, error, retry, reload, checkAccess, markRealtimeApplied, save, isBackgroundRefreshing, accessError, accessLost, remoteChanged } = useWhiteboard(accessToken, boardId)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorInstanceId, setEditorInstanceId] = useState<string | undefined>(undefined)
  const liveEditorRef = useRef<Editor | null>(null)
  const liveEditorInstanceIdRef = useRef<string | undefined>(undefined)
  const [restored, setRestored] = useState(false)
  const [assetsHydrated, setAssetsHydrated] = useState(false)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [taskNotice, setTaskNotice] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [assets, setAssets] = useState<WhiteboardAsset[]>([])
  const [taskCards, setTaskCards] = useState<Record<string, WhiteboardTaskCard>>({})
  const [taskCardsLoading, setTaskCardsLoading] = useState(false)
  const assetReferencesRef = useRef<WhiteboardAssetReferences>({})
  const assetReferencesInitializedBoardRef = useRef<string | null>(null)
  const assetReferencesOwnerId = useRef(`whiteboard-${Math.random().toString(36).slice(2)}`)
  const traceAssetReferences = useCallback((event: string, details: Record<string, unknown> = {}) => {
    if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace]', event, { ownerId: assetReferencesOwnerId.current, assetReferences: structuredClone(assetReferencesRef.current), ...details })
  }, [])
  const [uploading, setUploading] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [assetHydrationFailed, setAssetHydrationFailed] = useState(false)
  const [uploadStates, setUploadStates] = useState<Record<string, 'Uploading' | 'Uploaded' | 'Failed'>>({})
  const [retryFiles, setRetryFiles] = useState<Record<string, File>>({})
  const runtimeImageUrlsRef = useRef(new Map<string, string>())
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; title: string; shapeId?: string; point?: VecLike }>({ open: false, url: '', title: '' })
  const [browserFullscreen, setBrowserFullscreen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [snapshotReloadKey, setSnapshotReloadKey] = useState(0)
  const [realtimeStatus, setRealtimeStatus] = useState<WhiteboardRealtimeStatus>('offline')
  const [realtimeCompatibilityError, setRealtimeCompatibilityError] = useState<string | null>(null)
  const [realtimeReloadRequired, setRealtimeReloadRequired] = useState(false)
  const accessRoleRef = useRef<string | undefined>(undefined)
  const handleEditorMount = useCallback((mountedEditor: Editor | null) => {
    if (mountedEditor) {
      const nextEditorInstanceId = createWhiteboardUuid()
      liveEditorRef.current = mountedEditor
      liveEditorInstanceIdRef.current = nextEditorInstanceId
      setEditorInstanceId(nextEditorInstanceId)
      if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] VISIBLE_EDITOR_MOUNTED', { boardId, editorInstanceId: nextEditorInstanceId, editorReference: mountedEditor })
      setEditor(mountedEditor)
      return
    }
    liveEditorRef.current = null
    liveEditorInstanceIdRef.current = undefined
    setEditorInstanceId(undefined)
    setEditor(null)
  }, [boardId])
  useEffect(() => { accessRoleRef.current = board?.accessRole }, [board?.accessRole])
  useEffect(() => {
    if (!boardId) return
    const refresh = () => { if (document.visibilityState === 'visible') void checkAccess() }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [boardId, checkAccess])
  const getAssetReferences = useCallback(() => {
    if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] autosave owner', assetReferencesOwnerId.current)
    return assetReferencesRef.current
  }, [])
  useEffect(() => {
    const syncFullscreen = () => setBrowserFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    syncFullscreen()
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const toggleBrowserFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
      return
    }
    if (!document.documentElement.requestFullscreen) {
      setUploadNotice('Browser fullscreen is not supported.')
      return
    }
    void document.documentElement.requestFullscreen().catch(() => setUploadNotice('Browser fullscreen was denied.'))
  }, [])
  const saveWithStableAssetUrls = useCallback((payload: WhiteboardUpdate) => {
    if (!payload.snapshot) return save(payload)
    const snapshot = normalizeAssetSnapshot(payload.snapshot)
    try {
      const serialized = JSON.stringify(snapshot)
      if (!serialized || serialized.includes('"src":undefined') || serialized.includes('blob:') || serialized.includes('data:image/') || serialized.includes('asset:beeplan-missing')) {
        throw new Error('Image data could not be safely prepared for saving.')
      }
      if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] FINAL PATCH REFERENCES', getAssetReferences())
      if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] PATCH request body', { assetReferences: payload.assetReferences ?? {}, ...payload, snapshot: JSON.parse(serialized) })
      return save({ ...payload, snapshot: JSON.parse(serialized) })
    } catch (reason) {
      throw reason instanceof Error ? reason : new Error('Image data could not be safely prepared for saving.')
    }
  }, [getAssetReferences, save])
  const canEdit = board?.accessRole !== 'viewer'
  const isTextEditing = useCallback(() => Boolean(editor?.getEditingShapeId()), [editor])
  const autosave = useWhiteboardAutosave({
    editor,
    enabled: restored && assetsHydrated && canEdit,
    save: saveWithStableAssetUrls,
    getAssetReferences,
    isTextEditing,
  })
  const registerAssetReference = useCallback((reference: WhiteboardAssetReference) => {
    if (!reference.beeplanAssetId) throw new Error('Whiteboard upload succeeded without a backend asset ID')
    assetReferencesRef.current = {
      ...assetReferencesRef.current,
      [reference.tldrawAssetId]: reference,
    }
    if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] mapping write', { ownerId: assetReferencesOwnerId.current, reference, assetReferences: structuredClone(assetReferencesRef.current) })
  }, [])

  const replaceRuntimeImageUrl = useCallback((assetId: string, url: string) => {
    const previous = runtimeImageUrlsRef.current.get(assetId)
    if (previous && previous !== url) URL.revokeObjectURL(previous)
    runtimeImageUrlsRef.current.set(assetId, url)
  }, [])

  useEffect(() => () => {
    for (const url of runtimeImageUrlsRef.current.values()) URL.revokeObjectURL(url)
    runtimeImageUrlsRef.current.clear()
  }, [])
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks.list({}),
    queryFn: () => getTasks(accessToken ?? ''),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  })
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  useEffect(() => {
    if (!boardId || !board || !accessToken) {
      setTaskCards({})
      setTaskCardsLoading(false)
      return
    }
    const snapshot = board.snapshot as { document?: { store?: Record<string, unknown> }; store?: Record<string, unknown> } | null
    const store = snapshot?.document?.store ?? snapshot?.store ?? {}
    const taskIds = [...new Set(Object.values(store).flatMap((record) => {
      if (!record || typeof record !== 'object') return []
      const value = record as { type?: unknown; props?: { taskId?: unknown } }
      const taskId = value.props?.taskId
      return value.type === 'shape' && typeof taskId === 'string' && isValidTaskId(taskId) ? [taskId] : []
    }))]
    if (!taskIds.length) {
      setTaskCards({})
      setTaskCardsLoading(false)
      return
    }
    let active = true
    setTaskCardsLoading(true)
    void Promise.all(taskIds.map(async (taskId) => {
      try { return await getWhiteboardTaskCard(accessToken, boardId, taskId) } catch { return null }
    })).then((cards) => {
      if (!active) return
      setTaskCards(Object.fromEntries(cards.filter((card): card is WhiteboardTaskCard => Boolean(card)).map((card) => [card.taskId, card])))
    }).finally(() => { if (active) setTaskCardsLoading(false) })
    return () => { active = false }
  }, [accessToken, board, boardId])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void tasksQuery.refetch() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [tasksQuery.refetch])

  useEffect(() => {
    if (!editor) return
    const unlisten = editor.store.listen((entry) => {
      if (entry.source === 'remote') return
      const editingShapeId = editor.getEditingShapeId()
      if (!editingShapeId) return
      for (const [before, after] of Object.values(entry.changes.updated)) {
        if (!isTextShapeRecord(after as unknown as Record<string, unknown>) || String(after.id) !== String(editingShapeId)) continue
        const changed = getLocalTextGeometryChanges(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>)
        if (changed && import.meta.env.DEV) console.error('[WhiteboardLocalTextTrace] LOCAL_TEXT_GEOMETRY', { shapeId: after.id, changed })
      }
    })
    return unlisten
  }, [editor])

  const handleRetryLoad = useCallback(() => {
    void retry()
  }, [retry])

  const reloadRemoteSnapshot = useCallback(() => {
    void reload().then(() => { setSnapshotReloadKey((value) => value + 1); setRealtimeReloadRequired(false) })
  }, [reload])

  useEffect(() => {
    if (WHITEBOARD_REALTIME_DISABLED) {
      setRealtimeStatus('offline')
      return
    }
    if (!boardId || !editor || !restored || !assetsHydrated || !accessToken) return
    try {
      setRealtimeCompatibilityError(null)
      return connectWhiteboardRealtime(accessToken, boardId, editor, {
        onStatus: setRealtimeStatus,
        getAccessRole: () => accessRoleRef.current,
        getEditor: () => liveEditorRef.current,
        getEditorInstanceId: () => liveEditorInstanceIdRef.current,
        getVisibleEditorInstanceId: () => liveEditorInstanceIdRef.current,
        onRemotePatch: () => markRealtimeApplied(),
        onReloadRequired: () => setRealtimeReloadRequired(true),
      })
    } catch (error) {
      setRealtimeStatus('offline')
      setRealtimeCompatibilityError(error instanceof Error ? error.message : 'Whiteboard compatibility is unavailable in this browser.')
      return undefined
    }
  }, [accessToken, assetsHydrated, boardId, editor, editorInstanceId, markRealtimeApplied, restored])

  const addTaskToBoard = useCallback((task: ApiTask) => {
    if (!editor) return
    const existing = editor.getCurrentPageShapes().find((shape) => shape.type === BEEPLAN_TASK_SHAPE_TYPE && (shape.props as { taskId?: string }).taskId === task.id)
    if (existing) {
      editor.select(existing.id)
      editor.zoomToSelection({ animation: { duration: 180 } })
      setTaskNotice('That task is already on this board.')
      return
    }
    const bounds = editor.getViewportPageBounds()
    const id = createShapeId()
    editor.createShape({ id, type: BEEPLAN_TASK_SHAPE_TYPE, x: bounds.midX - 180, y: bounds.midY - 110, props: { taskId: task.id, w: 360, h: 220 } })
    editor.select(id)
    setTaskPickerOpen(false)
    setTaskNotice(null)
  }, [editor])

  const saveLink = useCallback((url: string, title: string) => {
    if (!editor) return
    if (linkDialog.shapeId) {
      editor.updateShape({ id: linkDialog.shapeId as never, type: BEEPLAN_LINK_SHAPE_TYPE, props: { url, title } })
    } else {
      const center = linkDialog.point ?? editor.getViewportPageBounds().center
      const id = createShapeId()
      editor.createShape({ id, type: BEEPLAN_LINK_SHAPE_TYPE, x: center.x - 150, y: center.y - 75, props: { url, title, w: 300, h: 150 } })
      editor.select(id)
    }
    setLinkDialog({ open: false, url: '', title: '' })
  }, [editor, linkDialog.shapeId])

  const openPastedLinkDialog = useCallback((url: string, point: VecLike) => {
    setLinkDialog({ open: true, url, title: '', point })
  }, [])

  const openLink = useCallback((url: string) => { if (normalizeWhiteboardUrl(url)) window.open(url, '_blank', 'noopener,noreferrer') }, [])
  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setUploadNotice('Link copied.')
    } catch {
      setUploadNotice('Unable to copy the link.')
    }
  }, [])

  const openAsset = useCallback(async (asset: WhiteboardAsset) => {
    try {
      const blob = await downloadWhiteboardAsset(accessToken ?? '', asset)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) {
      setUploadNotice(reason instanceof Error ? reason.message : 'Unable to open this file.')
    }
  }, [accessToken])

  const prepareUploadedImageAsset = useCallback(async (asset: WhiteboardAsset, requestedAssetId?: string) => {
    const blob = await downloadWhiteboardAsset(accessToken ?? '', asset)
    const src = assertValidRuntimeImageUrl(await createRuntimeImageUrl(blob))
    replaceRuntimeImageUrl(asset.id, src)
    const width = asset.width ?? 800
    const height = asset.height ?? 600
    const scale = Math.min(1, 700 / width, 500 / height)
    const tldrawAssetId = (requestedAssetId ?? AssetRecordType.createId(`beeplan-${asset.id}`)) as TLAssetId
    return {
      id: tldrawAssetId,
      type: 'image' as const,
      typeName: 'asset' as const,
      props: { src, w: width * scale, h: height * scale, name: asset.fileName, mimeType: asset.mimeType, isAnimated: asset.mimeType === 'image/gif', fileSize: asset.size },
      meta: { beeplanAssetId: asset.id, tldrawAssetId, stableResolverUrl: whiteboardAssetResolverUrl(asset.id) },
    }
  }, [accessToken, replaceRuntimeImageUrl])

  const insertUploadedAsset = useCallback(async (asset: WhiteboardAsset, point?: VecLike) => {
    if (!editor) return
    const center = point ?? editor.getViewportPageBounds().center
    if (asset.type === 'image') {
      const imageAsset = await prepareUploadedImageAsset(asset)
      const tldrawAssetId = imageAsset.id
      traceAssetReferences('mapping before insertion', { uploadResponse: asset, tldrawAssetId, beeplanAssetId: asset.id, stableResolverUrl: imageAsset.meta.stableResolverUrl })
      const createdShapeIds = await createShapesForAssets(editor, [imageAsset], center)
      const imageShape = createdShapeIds
        .map((shapeId) => editor.getShape(shapeId))
        .find((shape) => shape?.type === 'image')
      const actualTldrawAssetIdValue = (imageShape?.props as { assetId?: unknown } | undefined)?.assetId
      if (typeof actualTldrawAssetIdValue !== 'string' || !actualTldrawAssetIdValue) {
        throw new Error('Uploaded image did not produce a valid tldraw asset ID.')
      }
      const actualTldrawAssetId = actualTldrawAssetIdValue as TLAssetId
      const liveAsset = editor.getAsset(actualTldrawAssetId)
      if (!liveAsset) throw new Error('Uploaded image could not be registered in the whiteboard.')
      if (liveAsset.meta?.beeplanAssetId !== asset.id || liveAsset.meta?.tldrawAssetId !== actualTldrawAssetId || liveAsset.meta?.stableResolverUrl !== imageAsset.meta.stableResolverUrl) {
        editor.updateAssets([{ ...liveAsset, meta: { ...imageAsset.meta, tldrawAssetId: actualTldrawAssetId } }])
      }
      registerAssetReference({ tldrawAssetId: actualTldrawAssetId, beeplanAssetId: asset.id, stableResolverUrl: whiteboardAssetResolverUrl(asset.id) })
      traceAssetReferences('mapping after insertion', { tldrawAssetId: actualTldrawAssetId, liveAsset: editor.getAsset(actualTldrawAssetId) })
      traceAssetReferences('before explicit autosave schedule')
      autosave.schedule()
    } else {
      const id = createShapeId()
      editor.createShape({ id, type: BEEPLAN_FILE_SHAPE_TYPE, x: center.x - 140, y: center.y - 75, props: { assetId: asset.id, w: 280, h: 150 } })
      editor.select(id)
    }
  }, [autosave, editor, prepareUploadedImageAsset, registerAssetReference, traceAssetReferences])

  const handleExternalImageFile = useCallback(async (file: File, requestedAssetId?: string) => {
    const asset = await uploadWhiteboardAsset(accessToken ?? '', file)
    if (!asset.id) throw new Error('Whiteboard upload succeeded without a backend asset ID.')
    setAssets((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset])
    const imageAsset = await prepareUploadedImageAsset(asset, requestedAssetId)
    registerAssetReference({ tldrawAssetId: imageAsset.id, beeplanAssetId: asset.id, stableResolverUrl: whiteboardAssetResolverUrl(asset.id) })
    autosave.schedule()
    return imageAsset as NonNullable<Awaited<ReturnType<Editor['getAssetForExternalContent']>>>
  }, [accessToken, autosave, prepareUploadedImageAsset, registerAssetReference])

  const uploadFiles = useCallback(async (files: File[], point?: VecLike) => {
    if (!editor || !accessToken || uploading) return
    setUploading(true)
    setUploadNotice(null)
    let inserted = 0
    for (const [index, file] of files.entries()) {
      setUploadStates((current) => ({ ...current, [file.name]: 'Uploading' }))
      try {
        const asset = await uploadWhiteboardAsset(accessToken, file)
        traceAssetReferences('frontend upload response received', { fileName: file.name, uploadResponse: asset, returnedBeePlanAssetId: asset.id })
        setAssets((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset])
        await insertUploadedAsset(asset, point ? { x: point.x + index * 32, y: point.y + index * 32 } : undefined)
        inserted++
        setUploadStates((current) => ({ ...current, [file.name]: 'Uploaded' }))
        setRetryFiles((current) => { const next = { ...current }; delete next[file.name]; return next })
      } catch (reason) {
        setUploadStates((current) => ({ ...current, [file.name]: 'Failed' }))
        setRetryFiles((current) => ({ ...current, [file.name]: file }))
        setUploadNotice(`${file.name}: ${reason instanceof Error ? reason.message : 'Upload failed.'}`)
      }
    }
    if (inserted) setUploadNotice(`${inserted} file${inserted === 1 ? '' : 's'} uploaded.`)
    setUploading(false)
  }, [accessToken, editor, insertUploadedAsset, traceAssetReferences, uploading])

  const hydrateReferencedAssets = useCallback(async (mountedEditor: Editor) => {
    if (!accessToken) return
    setAssetHydrationFailed(false)
    const ids = new Set<string>()
    const imageRecords = mountedEditor.getAssets().filter((asset) => asset.type === 'image')
    if (import.meta.env.DEV) console.debug('[Whiteboard asset] hydration started', { imageCount: imageRecords.length, assets: imageRecords.map((asset) => ({ tldrawAssetId: asset.id, beeplanAssetId: getBeePlanAssetId(asset), src: asset.props.src })) })
    mountedEditor.getCurrentPageShapes().forEach((shape) => {
      if (shape.type === BEEPLAN_FILE_SHAPE_TYPE) ids.add((shape.props as { assetId: string }).assetId)
    })
    mountedEditor.getAssets().forEach((asset) => {
      const id = assetReferencesRef.current[asset.id]?.beeplanAssetId ?? getBeePlanAssetId(asset)
      if (id) ids.add(id)
    })
    const loaded = await Promise.all(Array.from(ids).map((id) => getWhiteboardAsset(accessToken, id).catch((reason) => { if (import.meta.env.DEV) console.debug('[Whiteboard asset] metadata failed', { beeplanAssetId: id, reason }); return null })))
    const valid = loaded.filter((asset): asset is WhiteboardAsset => Boolean(asset))
    setAssets(valid)
    for (const existing of imageRecords) {
      const beeplanAssetId = assetReferencesRef.current[existing.id]?.beeplanAssetId ?? getBeePlanAssetId(existing)
      if (!beeplanAssetId) {
        if (import.meta.env.DEV) console.debug('[Whiteboard asset] hydration skipped: no backend asset id', { tldrawAssetId: existing.id, src: existing.props.src })
        continue
      }
      const asset = valid.find((item) => item.id === beeplanAssetId) ?? {
        id: beeplanAssetId,
        type: 'image' as const,
        fileName: typeof existing.props.name === 'string' ? existing.props.name : 'Whiteboard image',
        url: whiteboardAssetResolverUrl(beeplanAssetId),
        mimeType: typeof existing.props.mimeType === 'string' ? existing.props.mimeType : 'image/png',
        size: typeof existing.props.fileSize === 'number' ? existing.props.fileSize : 1,
        width: typeof existing.props.w === 'number' ? existing.props.w : null,
        height: typeof existing.props.h === 'number' ? existing.props.h : null,
        createdAt: '',
      }
      if (import.meta.env.DEV) console.debug('[Whiteboard asset] hydration started', { tldrawAssetId: existing.id, beeplanAssetId, url: asset.url })
      try {
        if (import.meta.env.DEV) console.debug('[Whiteboard asset] fetch started', { tldrawAssetId: existing.id, beeplanAssetId, url: asset.url })
        const blob = await downloadWhiteboardAsset(accessToken, asset)
        if (import.meta.env.DEV) console.debug('[Whiteboard asset] blob received', { tldrawAssetId: existing.id, beeplanAssetId, size: blob.size })
        const src = assertValidRuntimeImageUrl(await createRuntimeImageUrl(blob))
        replaceRuntimeImageUrl(asset.id, src)
        if (import.meta.env.DEV) console.debug('[Whiteboard asset] object URL created', { tldrawAssetId: existing.id, beeplanAssetId, src })
        mountedEditor.updateAssets([{ ...existing, props: { ...existing.props, src } }])
        if (import.meta.env.DEV) console.debug('[Whiteboard asset] editor asset updated', { tldrawAssetId: existing.id, beeplanAssetId, finalSrc: mountedEditor.getAsset(existing.id)?.props.src })
      } catch (reason) {
        setAssetHydrationFailed(true)
        if (import.meta.env.DEV) console.debug('[Whiteboard asset] hydration failed', { tldrawAssetId: existing.id, beeplanAssetId, reason })
        mountedEditor.updateAssets([{ ...existing, props: { ...existing.props, src: WHITEBOARD_IMAGE_UNAVAILABLE_URL } }])
        setUploadNotice(`Image unavailable: ${asset.fileName}`)
      }
    }
  }, [accessToken, replaceRuntimeImageUrl])

  const retryAssetHydration = useCallback(() => {
    if (editor) void hydrateReferencedAssets(editor)
  }, [editor, hydrateReferencedAssets])

  const finishRestoration = useCallback(async (mountedEditor: Editor) => {
    setEditor(mountedEditor)
    if (board && assetReferencesInitializedBoardRef.current !== board.id) {
      assetReferencesRef.current = board.assetReferences ?? {}
      assetReferencesInitializedBoardRef.current = board.id
      traceAssetReferences('initialized from GET', { boardId: board.id })
    }
    if (import.meta.env.DEV) console.debug('[Whiteboard] hydration lifecycle entered')
    try {
      await hydrateReferencedAssets(mountedEditor)
    } catch (reason) {
      setUploadNotice(reason instanceof Error ? `Some assets could not be restored: ${reason.message}` : 'Some assets could not be restored.')
    } finally {
      // Missing or malformed assets are recoverable. The board must still become
      // editable and autosave must still observe subsequent user changes.
      setAssetsHydrated(true)
      setRestored(true)
    }
  }, [board?.id, board?.assetReferences, hydrateReferencedAssets, traceAssetReferences])

  const completeTask = useCallback(async (task: ApiTask) => {
    if (!accessToken || busyTaskId) return
    setBusyTaskId(task.id)
    try {
      const updated = await changeTaskStatus(accessToken, task.id, { status: task.status === 'done' ? 'todo' : 'done' })
      queryClient.setQueryData(queryKeys.tasks.detail(updated.id), updated)
      queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) => Array.isArray(current) ? current.map((item) => item.id === updated.id ? updated : item) : current)
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    } catch (reason) {
      setTaskNotice(reason instanceof Error ? reason.message : 'Unable to update task.')
    } finally {
      setBusyTaskId(null)
    }
  }, [accessToken, busyTaskId, queryClient])

  const taskContext = useMemo(() => ({
    tasks,
    loading: tasksQuery.isLoading,
    taskCards,
    taskCardsLoading,
    onCompleteTask: completeTask,
    onOpenTask: (taskId: string) => onOpenTask?.(taskId),
    onStartFocus: async (task: ApiTask) => { if (onStartFocus) await onStartFocus(task) },
    onRemoveShape: (shapeId: string) => editor?.deleteShapes([shapeId as TLShapeId]),
    busyTaskId,
  }), [tasks, tasksQuery.isLoading, taskCards, taskCardsLoading, completeTask, onOpenTask, onStartFocus, editor, busyTaskId])

  const status = loading
    ? 'Loading'
    : error
      ? 'Save failed'
      : autosave.status === 'unsaved'
        ? 'Unsaved'
        : autosave.status === 'saving'
          ? 'Saving'
          : autosave.status === 'failed'
            ? 'Save failed'
              : autosave.status === 'saved'
                ? 'Saved'
                : null
  const showRemoteReload = import.meta.env.DEV ? realtimeReloadRequired : Boolean(realtimeReloadRequired || (remoteChanged && realtimeStatus !== 'connected'))
  useEffect(() => {
    if (!import.meta.env.DEV || !boardId) return
    if (import.meta.env.DEV) console.error('[WhiteboardRealtimeTrace] STALE_BANNER_DECISION', {
      traceId: null,
      eventId: null,
      boardId,
      socketId: null,
      serverRevision: null,
      localAppliedRevision: null,
      latestServerRevision: null,
      loadedRevision: null,
      updatedAt: board?.updatedAt,
      loadedUpdatedAt: board?.updatedAt,
      hasLocalUnsavedChanges: autosave.status === 'unsaved' || autosave.status === 'saving',
      realtimeConnected: realtimeStatus === 'connected',
      reloadRequired: realtimeReloadRequired,
      result: showRemoteReload,
      reason: realtimeReloadRequired ? 'server-requested-reload' : remoteChanged ? (realtimeStatus === 'connected' ? 'suppressed-while-connected' : 'http-updatedAt-while-disconnected') : 'no-stale-signal',
    })
  }, [autosave.status, board?.updatedAt, boardId, realtimeReloadRequired, realtimeStatus, remoteChanged, showRemoteReload])

  if (accessLost) {
    return <main className="flex h-full min-h-0 flex-1 items-center justify-center bg-[var(--bp-bg)] p-6 text-[var(--bp-text)]"><section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 text-center"><h1 className="text-lg font-bold">Whiteboard access lost</h1><p className="mt-2 text-sm text-[var(--bp-muted)]">You no longer have access to this board.</p></section></main>
  }

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-[var(--bp-bg)] text-[var(--bp-text)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--bp-border)] px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--bp-muted)]">Workspace</p>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">Personal Whiteboard</h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--bp-muted)]" aria-live="polite">
          {status && <span>{status}</span>}
          {isBackgroundRefreshing && <span className="text-[var(--bp-muted)]">Checking access…</span>}
          {boardId && <span className={realtimeStatus === 'connected' ? 'text-emerald-600 dark:text-emerald-400' : realtimeStatus === 'access-lost' ? 'text-red-600 dark:text-red-400' : realtimeStatus === 'reconnecting' || realtimeStatus === 'connecting' ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--bp-muted)]'}><span className="me-1" aria-hidden="true">●</span>{realtimeStatus === 'connected' ? 'Connected' : realtimeStatus === 'reconnecting' || realtimeStatus === 'connecting' ? 'Reconnecting…' : realtimeStatus === 'access-lost' ? 'Access lost' : 'Offline'}</span>}
          {realtimeCompatibilityError && <span role="alert" className="text-red-600 dark:text-red-400">{realtimeCompatibilityError}</span>}
          {(error || autosave.status === 'failed' || assetHydrationFailed) && (
            <button
              type="button"
              onClick={error ? handleRetryLoad : autosave.status === 'failed' ? autosave.retry : retryAssetHydration}
              className="rounded-lg border border-[var(--bp-border)] px-2.5 py-1.5 font-semibold text-[var(--bp-text)] hover:border-[var(--bp-accent)]"
            >
              Retry
            </button>
          )}
          {onToggleFocusMode && <button type="button" aria-label={focusMode ? 'Exit Whiteboard Focus Mode' : 'Enter Whiteboard Focus Mode'} title={focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'} onClick={onToggleFocusMode} className="rounded-lg border border-[var(--bp-border)] p-2 text-[var(--bp-text)] hover:border-[var(--bp-accent)]">
            {focusMode ? <Minimize className="h-4 w-4" aria-hidden="true" /> : <Expand className="h-4 w-4" aria-hidden="true" />}
          </button>}
          {boardId && <button type="button" aria-label="Share whiteboard" title="Share whiteboard" onClick={() => setShareOpen(true)} className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-xs font-semibold text-[var(--bp-text)]">Share</button>}
          {boardId && board?.accessRole !== 'owner' && onLeaveBoard && <button type="button" onClick={() => { if (window.confirm('Leave this Whiteboard?')) void leaveWhiteboard(accessToken ?? '', boardId).then(onLeaveBoard) }} className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-700">Leave</button>}
          <button type="button" aria-label={browserFullscreen ? 'Exit Browser Fullscreen' : 'Browser Fullscreen'} title={browserFullscreen ? 'Exit Browser Fullscreen' : 'Browser Fullscreen'} onClick={toggleBrowserFullscreen} className="rounded-lg border border-[var(--bp-border)] p-2 text-[var(--bp-text)] hover:border-[var(--bp-accent)]">
            <Maximize className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        {canEdit ? <WhiteboardToolbar editor={editor} taskOpen={taskPickerOpen} linkOpen={linkDialog.open} uploading={uploading} onUpload={(files) => void uploadFiles(files)} onTaskClick={() => setTaskPickerOpen(true)} onLinkClick={() => setLinkDialog({ open: true, url: '', title: '' })} /> : <div className="shrink-0 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 text-sm text-[var(--bp-muted)]">View only</div>}
        {(accessError || showRemoteReload || uploadNotice || Object.keys(uploadStates).length > 0) && <div className="shrink-0 text-xs text-[var(--bp-muted)]" role="status">{accessError && <p>{accessError}</p>}{showRemoteReload && <p className="flex items-center gap-2"><span>New changes are available.</span><button type="button" onClick={reloadRemoteSnapshot} className="font-semibold text-[var(--bp-accent)]">Reload</button></p>}{uploadNotice && <p>{uploadNotice}</p>}{Object.entries(uploadStates).map(([name, state]) => <div key={name} className="mt-1 flex items-center gap-2"><span>{name}: {state}</span>{state === 'Failed' && retryFiles[name] && <button type="button" onClick={() => void uploadFiles([retryFiles[name]])} className="font-semibold text-[var(--bp-accent)]">Retry</button>}</div>)}</div>}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <WhiteboardTaskProvider value={taskContext}>
            <WhiteboardAssetProvider value={{ assets, onOpen: openAsset, onRemoveShape: (shapeId) => editor?.deleteShapes([shapeId as TLShapeId]) }}>
            <WhiteboardLinkProvider value={{ onOpen: openLink, onCopy: copyLink, onEdit: (shapeId, url, title) => setLinkDialog({ open: true, url, title, shapeId }) }}>
            <WhiteboardCanvas
              reloadKey={snapshotReloadKey}
              editorInstanceId={editorInstanceId}
              board={board}
              loading={loading}
              error={error}
              onRetry={handleRetryLoad}
              onMount={handleEditorMount}
              onFiles={(files, point) => void uploadFiles(files, point)}
              onExternalImageFile={handleExternalImageFile}
              onPasteUrl={openPastedLinkDialog}
              onRestored={finishRestoration}
              readOnly={!canEdit}
            />
            <WhiteboardAdvancedControls editor={editor} readOnly={!canEdit} />
            </WhiteboardLinkProvider>
            </WhiteboardAssetProvider>
          </WhiteboardTaskProvider>
          <WhiteboardTaskPicker open={taskPickerOpen} tasks={tasks} loading={tasksQuery.isLoading} error={tasksQuery.error instanceof Error ? tasksQuery.error.message : null} onClose={() => setTaskPickerOpen(false)} onRetry={() => void tasksQuery.refetch()} onAdd={addTaskToBoard} notice={taskNotice} />
        </div>
      </div>
      <WhiteboardLinkDialog open={linkDialog.open} initialUrl={linkDialog.url} initialTitle={linkDialog.title} onClose={() => setLinkDialog({ open: false, url: '', title: '' })} onSave={saveLink} />
      {boardId && <WhiteboardShareDialog open={shareOpen} boardId={boardId} accessRole={board?.accessRole ?? 'viewer'} token={accessToken ?? ''} onClose={() => setShareOpen(false)} />}
    </main>
  )
}

class WhiteboardScreenErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    const compatibilityError = this.state.error.message.includes('Secure UUID generation')
    return (
      <main className="flex min-h-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900" role="alert">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Whiteboard could not be loaded.</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {compatibilityError ? 'This WebView does not provide secure UUID generation.' : 'The Whiteboard encountered an unexpected error.'}
          </p>
          <div className="mt-5 flex gap-3">
            <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => this.setState({ error: null })}>Retry</button>
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200" onClick={() => window.location.assign('/whiteboards')}>Back to Whiteboards</button>
          </div>
        </section>
      </main>
    )
  }
}

export function WhiteboardScreen(props: WhiteboardScreenProps) {
  return (
    <WhiteboardScreenErrorBoundary>
      <WhiteboardScreenContent {...props} />
    </WhiteboardScreenErrorBoundary>
  )
}
