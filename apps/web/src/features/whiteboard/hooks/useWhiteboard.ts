import { useCallback, useEffect, useRef, useState } from 'react'
import { getWhiteboard, getWhiteboardAccess, openWhiteboard, updateWhiteboard, type Whiteboard, type WhiteboardUpdate } from '../api/whiteboardApi'

export function useWhiteboard(accessToken: string | null, boardId?: string) {
  const [board, setBoard] = useState<Whiteboard | null>(null)
  const [loading, setLoading] = useState(Boolean(accessToken))
  const [error, setError] = useState<string | null>(null)
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessLost, setAccessLost] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const boardRef = useRef<Whiteboard | null>(null)
  const realtimeAppliedRef = useRef(false)

  useEffect(() => { boardRef.current = board }, [board])

  const loadBoard = useCallback(async (showInitialLoader: boolean) => {
    if (!accessToken) return
    const controller = new AbortController()
    if (showInitialLoader) setLoading(true)
    else setIsBackgroundRefreshing(true)
    setError(null)
    try {
      const loaded = await getWhiteboard(accessToken, controller.signal, boardId)
      const opened = boardId ? await openWhiteboard(accessToken, boardId).catch(() => loaded) : loaded
      boardRef.current = opened
      setBoard(opened)
      setRemoteChanged(false)
      setAccessError(null)
      setAccessLost(false)
    } catch (reason: unknown) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load the whiteboard.')
    } finally {
      if (!controller.signal.aborted) {
        if (showInitialLoader) setLoading(false)
        else setIsBackgroundRefreshing(false)
      }
    }
  }, [accessToken, boardId])

  useEffect(() => {
    if (!accessToken) {
      setBoard(null); boardRef.current = null; setLoading(false); setError(null); return
    }
    void loadBoard(true)
  }, [accessToken, boardId, loadBoard])

  const checkAccess = useCallback(async () => {
    if (!accessToken || !boardId) return
    setIsBackgroundRefreshing(true)
    setAccessError(null)
    try {
      const metadata = await getWhiteboardAccess(accessToken, boardId)
      setBoard((current) => {
        if (!current) return current
        if (metadata.updatedAt !== current.updatedAt) {
          if (realtimeAppliedRef.current) realtimeAppliedRef.current = false
          else setRemoteChanged(true)
        }
        const next = { ...current, accessRole: metadata.accessRole, updatedAt: metadata.updatedAt }
        boardRef.current = next
        return next
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to check board access.'
      setAccessError(message)
      if (/board not found|not authorized|forbidden/i.test(message)) {
        boardRef.current = null
        setBoard(null)
        setAccessLost(true)
      }
    } finally {
      setIsBackgroundRefreshing(false)
    }
  }, [accessToken, boardId])

  const retry = useCallback(() => loadBoard(Boolean(!boardRef.current)), [loadBoard])
  const reload = useCallback(() => loadBoard(false), [loadBoard])
  const markRealtimeApplied = useCallback(() => { realtimeAppliedRef.current = true; setRemoteChanged(false) }, [])

  const save = useCallback(async (payload: WhiteboardUpdate) => {
    if (!accessToken) throw new Error('Please sign in to save the whiteboard.')
    const updated = await updateWhiteboard(accessToken, payload, undefined, boardId)
    boardRef.current = updated
    setBoard(updated)
    setRemoteChanged(false)
    return updated
  }, [accessToken, boardId])

  return { board, loading, error, retry, reload, checkAccess, markRealtimeApplied, save, isBackgroundRefreshing, accessError, accessLost, remoteChanged }
}
