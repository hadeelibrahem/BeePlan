import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewErrorEvent, WebViewHttpErrorEvent, WebViewNavigation, WebViewNavigationEvent, WebViewRenderProcessGoneEvent } from 'react-native-webview/lib/WebViewTypes'
import { useAuth } from '../../../hooks/useAuth'
import { useTheme } from '../../../theme/useTheme'
import { MobileIcon } from '../../../components/layout/MobileIcon'
import { buildWhiteboardWebViewUrl, logWebAppConfig, resolveWebAppConfig, type WebAppConfig } from '../../../lib/mobileConfig'
import { listWhiteboards, leaveWhiteboard } from '../api/whiteboardApi'
import { MOBILE_AUTH_CLEAR, MOBILE_AUTH_READY, MOBILE_AUTH_SESSION } from '../authBridge'

type Failure = { kind: 'missing_config' | 'invalid_url' | 'unreachable_host' | 'http_error' | 'navigation_blocked' | 'load_timeout' | 'invalid_board' | 'renderer_crashed'; message: string; status?: number }
type DiagnosticEvent = { url?: string; code?: number; description?: string; statusCode?: number; reason?: string }

function resolveExpiry(accessToken: string) {
  try {
    const encoded = accessToken.split('.')[1]
    if (!encoded || typeof globalThis.atob !== 'function') return undefined
    const payload = JSON.parse(globalThis.atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
  } catch { return undefined }
}

export default function WhiteboardEditorScreen({ route, navigation }: { route: { params?: { boardId?: string } }; navigation: any }) {
  const { session, accessToken } = useAuth()
  const { theme } = useTheme()
  const { colors } = theme
  const insets = useSafeAreaInsets()
  const boardId = route.params?.boardId?.trim() ?? ''
  const [config] = useState<WebAppConfig>(() => resolveWebAppConfig())
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [role, setRole] = useState<'owner' | 'editor' | 'viewer'>('owner')
  const [webReady, setWebReady] = useState(false)
  const webViewRef = useRef<WebView>(null)
  const mountIdRef = useRef(`whiteboard-${Math.random().toString(36).slice(2)}`)
  const hasSentSessionRef = useRef<string | null>(null)
  const currentTopLevelUrlRef = useRef<string | null>(null)
  const navigationGenerationRef = useRef(0)
  const activeLoadGenerationRef = useRef<number | null>(null)
  const hasCompletedInitialLoadRef = useRef(false)
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstErrorLoggedRef = useRef(false)

  const editorUrl = useMemo(() => config.kind === 'valid' ? buildWhiteboardWebViewUrl(config.url, boardId) : null, [boardId, config])
  const webViewSource = useMemo(() => editorUrl ? { uri: editorUrl } : undefined, [editorUrl])
  const allowedOrigin = config.kind === 'valid' ? config.origin : ''

  useEffect(() => {
    currentTopLevelUrlRef.current = editorUrl
    activeLoadGenerationRef.current = null
    hasCompletedInitialLoadRef.current = false
    if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null }
  }, [editorUrl])
  useEffect(() => {
    if (__DEV__) console.log('[MOBILE_WHITEBOARD] WEBVIEW_COMPONENT_MOUNT', { boardId, url: editorUrl, mountId: mountIdRef.current, reason: 'screen_mount' })
    return () => { if (__DEV__) console.log('[MOBILE_WHITEBOARD] WEBVIEW_COMPONENT_UNMOUNT', { boardId, url: editorUrl, mountId: mountIdRef.current, reason: 'screen_unmount' }) }
  }, [])
  useEffect(() => { if (__DEV__) console.log('[MOBILE_WHITEBOARD] WEBVIEW_SOURCE_CHANGED', { boardId, url: editorUrl, mountId: mountIdRef.current, reason: 'board_or_config_change' }) }, [boardId, editorUrl])
  useEffect(() => { hasSentSessionRef.current = null; setWebReady(false) }, [boardId, session?.user.id])
  useEffect(() => { logWebAppConfig(config) }, [config])
  useEffect(() => {
    if (!accessToken || !boardId) return
    void listWhiteboards(accessToken).then((boards) => {
      const board = boards.find((item) => item.id === boardId)
      if (board) setRole(board.accessRole)
    }).catch(() => undefined)
  }, [accessToken, boardId])
  useEffect(() => {
    if (!boardId) setFailure({ kind: 'invalid_board', message: 'This Whiteboard link does not contain a board ID.' })
    else if (config.kind !== 'valid') setFailure({ kind: config.kind, message: config.message })
    else if (!editorUrl) setFailure({ kind: 'invalid_url', message: 'The Whiteboard URL could not be built.' })
  }, [boardId, config, editorUrl])

  const logEvent = useCallback((event: string, nativeEvent?: DiagnosticEvent, extra: Record<string, unknown> = {}) => {
    if (!__DEV__) return
    console.log(`[MOBILE_WHITEBOARD] ${event}`, { event, url: nativeEvent?.url, code: nativeEvent?.code, description: nativeEvent?.description, statusCode: nativeEvent?.statusCode, currentTopLevelUrl: currentTopLevelUrlRef.current, topLevel: !nativeEvent?.url || nativeEvent.url === currentTopLevelUrlRef.current, timestamp: Date.now(), mountId: mountIdRef.current, boardId, navigationGeneration: navigationGenerationRef.current, ...extra })
  }, [boardId])
  const isTopLevel = useCallback((url?: string) => !url || url === currentTopLevelUrlRef.current || url === editorUrl, [editorUrl])
  const clearTimeoutFor = useCallback(() => { if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; if (__DEV__) console.log('[MOBILE_WHITEBOARD] WEBVIEW_TIMEOUT_CANCELLED', { boardId, mountId: mountIdRef.current }) } }, [boardId])
  const onLoadStart = useCallback((event: WebViewNavigationEvent) => {
    const nativeEvent = event.nativeEvent
    if (!isTopLevel(nativeEvent.url)) { logEvent('WEBVIEW_SUBRESOURCE_ERROR_IGNORED', nativeEvent, { reason: 'load_start_non_main_document' }); return }
    const generation = ++navigationGenerationRef.current
    activeLoadGenerationRef.current = generation
    currentTopLevelUrlRef.current = nativeEvent.url || editorUrl
    hasCompletedInitialLoadRef.current = false
    setWebReady(false); setLoading(true); setFailure(null)
    clearTimeoutFor()
    loadTimeoutRef.current = setTimeout(() => {
      if (activeLoadGenerationRef.current !== generation) return
      activeLoadGenerationRef.current = null
      setLoading(false)
      setFailure({ kind: 'load_timeout', message: 'The Whiteboard took too long to respond.' })
      logEvent('WEBVIEW_MAIN_DOCUMENT_ERROR', nativeEvent, { reason: 'load_timeout', generation })
    }, 15_000)
    logEvent('LOAD_START', nativeEvent, { generation })
  }, [clearTimeoutFor, editorUrl, isTopLevel, logEvent])
  const onLoadEnd = useCallback((event: WebViewNavigationEvent | WebViewErrorEvent) => {
    const nativeEvent = event.nativeEvent
    if (!isTopLevel(nativeEvent.url)) { logEvent('WEBVIEW_SUBRESOURCE_ERROR_IGNORED', nativeEvent, { reason: 'load_end_non_main_document' }); return }
    activeLoadGenerationRef.current = null; clearTimeoutFor(); hasCompletedInitialLoadRef.current = true
    setLoading(false); setFailure(null); logEvent('WEBVIEW_MAIN_DOCUMENT_SUCCESS', nativeEvent, { generation: navigationGenerationRef.current })
  }, [clearTimeoutFor, isTopLevel, logEvent])
  const onWebViewError = useCallback((event: WebViewErrorEvent) => {
    const nativeEvent = event.nativeEvent
    if (!isTopLevel(nativeEvent.url)) { logEvent('WEBVIEW_SUBRESOURCE_ERROR_IGNORED', nativeEvent, { reason: 'non_main_document' }); return }
    if (hasCompletedInitialLoadRef.current && activeLoadGenerationRef.current === null) { logEvent('WEBVIEW_STALE_ERROR_IGNORED', nativeEvent, { reason: 'after_successful_load' }); return }
    clearTimeoutFor(); setLoading(false); setFailure({ kind: /host|network|refused|unreachable/i.test(nativeEvent.description ?? '') ? 'unreachable_host' : 'navigation_blocked', message: nativeEvent.description || 'The WebView could not load the Whiteboard.' })
    logEvent('WEBVIEW_MAIN_DOCUMENT_ERROR', nativeEvent, { reason: 'webview_error' })
    if (__DEV__ && !firstErrorLoggedRef.current) { firstErrorLoggedRef.current = true; console.error('[MOBILE_WHITEBOARD] FIRST_LOAD_ERROR', { boardId, url: editorUrl, mountId: mountIdRef.current, reason: nativeEvent.description }) }
  }, [boardId, clearTimeoutFor, editorUrl, isTopLevel, logEvent])
  const onHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const nativeEvent = event.nativeEvent
    if (!isTopLevel(nativeEvent.url)) { logEvent('WEBVIEW_SUBRESOURCE_ERROR_IGNORED', nativeEvent, { reason: 'http_non_main_document' }); return }
    if (hasCompletedInitialLoadRef.current && activeLoadGenerationRef.current === null) { logEvent('WEBVIEW_STALE_ERROR_IGNORED', nativeEvent, { reason: 'http_after_successful_load' }); return }
    clearTimeoutFor(); setLoading(false); setFailure({ kind: 'http_error', status: nativeEvent.statusCode, message: `The Whiteboard server returned HTTP ${nativeEvent.statusCode}.` }); logEvent('WEBVIEW_MAIN_DOCUMENT_ERROR', nativeEvent, { reason: 'http_error' })
  }, [clearTimeoutFor, isTopLevel, logEvent])
  const onRenderProcessGone = useCallback((event: WebViewRenderProcessGoneEvent) => { const nativeEvent = event.nativeEvent as unknown as DiagnosticEvent; logEvent('WEBVIEW_RENDERER_CRASHED', nativeEvent, { reason: nativeEvent.reason ?? 'render_process_gone' }); setLoading(false); setFailure({ kind: 'renderer_crashed', message: 'The Whiteboard renderer stopped unexpectedly. Please retry.' }) }, [logEvent])
  const onContentProcessDidTerminate = useCallback((event: { nativeEvent?: unknown }) => { const nativeEvent = event.nativeEvent as DiagnosticEvent | undefined; logEvent('WEBVIEW_RENDERER_CRASHED', nativeEvent, { reason: nativeEvent?.reason ?? 'content_process_terminated' }); setLoading(false); setFailure({ kind: 'renderer_crashed', message: 'The Whiteboard renderer stopped unexpectedly. Please retry.' }) }, [logEvent])
  const retry = useCallback(() => { setFailure(null); setLoading(true); setWebReady(false); hasSentSessionRef.current = null; if (__DEV__) console.log('[MOBILE_WHITEBOARD] WEBVIEW_RELOAD_CALLED', { boardId, url: editorUrl, mountId: mountIdRef.current, reason: 'explicit_retry' }); webViewRef.current?.reload() }, [boardId, editorUrl])
  const sendSession = useCallback(() => {
    if (!webReady) return
    const sessionKey = session ? `${session.user.id}:${session.accessToken}` : 'clear'
    if (hasSentSessionRef.current === sessionKey || !webViewRef.current) return
    const message = session ? { type: MOBILE_AUTH_SESSION, payload: { accessToken: session.accessToken, expiresAt: resolveExpiry(session.accessToken), user: session.user } } : { type: MOBILE_AUTH_CLEAR }
    webViewRef.current.postMessage(JSON.stringify(message)); hasSentSessionRef.current = sessionKey
    if (__DEV__) console.log('[MOBILE_WHITEBOARD] AUTH_SESSION_SENT', { boardId, url: editorUrl, mountId: mountIdRef.current, reason: session ? 'webview_ready' : 'native_logout' })
  }, [boardId, editorUrl, session, webReady])
  useEffect(() => { sendSession() }, [sendSession])
  const onWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => { if (event.nativeEvent.data === MOBILE_AUTH_READY) { setWebReady(true); return } try { const message = JSON.parse(event.nativeEvent.data) as { type?: string }; if (message.type === MOBILE_AUTH_READY) setWebReady(true) } catch { /* Ignore unrelated WebView messages. */ } }, [])
  const onNavigationRequest = useCallback((request: WebViewNavigation) => { if (!allowedOrigin || request.url === 'about:blank' || request.url.startsWith(`${allowedOrigin}/`)) return true; if (__DEV__) console.warn('[MOBILE_WHITEBOARD] navigation blocked', request.url); setFailure({ kind: 'navigation_blocked', message: 'Navigation outside BeePlan was blocked.' }); return false }, [allowedOrigin])
  const leave = async () => { setMenuOpen(false); if (!accessToken || role === 'owner') { navigation.goBack(); return } await leaveWhiteboard(accessToken, boardId).catch(() => undefined); navigation.popToTop() }
  if (!session) return <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}><Text style={{ color: colors.text }}>Sign in to open this Whiteboard.</Text></View>
  return <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}><View className="z-10 flex-row items-center border-b px-3" style={{ minHeight: 64, borderColor: colors.border, backgroundColor: colors.surface, elevation: 6, paddingTop: 4 }}><Pressable accessibilityRole="button" accessibilityLabel="Back to whiteboards" hitSlop={8} onPress={() => navigation.goBack()} className="h-12 w-12 items-center justify-center rounded-xl"><Text className="text-2xl" style={{ color: colors.text }}>‹</Text></Pressable><Text className="mx-2 flex-1 text-center text-base font-black" numberOfLines={1} style={{ color: colors.text }}>Personal Whiteboard</Text><Pressable accessibilityRole="button" accessibilityLabel="Share whiteboard" hitSlop={8} onPress={() => navigation.navigate('WhiteboardShare', { boardId })} className="h-12 min-w-12 items-center justify-center rounded-xl px-2"><MobileIcon name="people" color={colors.accent} size={21} /><Text className="mt-0.5 text-[10px] font-black" style={{ color: colors.accent }}>Share</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="More whiteboard actions" hitSlop={8} onPress={() => setMenuOpen(true)} className="ms-1 h-12 w-12 items-center justify-center rounded-xl"><MobileIcon name="more" color={colors.text} size={22} /></Pressable></View><View className="flex-1" style={{ position: 'relative' }}>{editorUrl ? <><WebView ref={webViewRef} source={webViewSource} onMessage={onWebViewMessage} onLoadStart={onLoadStart} onLoadEnd={onLoadEnd} onError={onWebViewError} onHttpError={onHttpError} onNavigationStateChange={(state) => { currentTopLevelUrlRef.current = state.url || currentTopLevelUrlRef.current; logEvent('NAVIGATION', state, { loading: state.loading, topLevel: true }) }} onShouldStartLoadWithRequest={onNavigationRequest} onRenderProcessGone={onRenderProcessGone} onContentProcessDidTerminate={onContentProcessDidTerminate} startInLoadingState javaScriptEnabled domStorageEnabled originWhitelist={['http://*', 'https://*']} setSupportMultipleWindows={false} allowsInlineMediaPlayback style={{ flex: 1 }} />{loading ? <View pointerEvents="none" className="absolute inset-0 items-center justify-center" style={{ backgroundColor: colors.background, opacity: 0.94 }}><ActivityIndicator color={colors.accent} /><Text className="mt-3" style={{ color: colors.secondaryText }}>Loading Whiteboard…</Text></View> : null}{failure ? <View className="absolute inset-0 items-center justify-center px-6" style={{ backgroundColor: colors.background, opacity: 0.97 }}><MobileIcon name="whiteboard" color={colors.accent} size={40} /><Text className="mt-4 text-center text-lg font-black" style={{ color: colors.text }}>Whiteboard could not be loaded.</Text><Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>{failure.message}</Text><Text className="mt-2 text-center text-xs font-bold" style={{ color: colors.secondaryText }}>Reason: {failure.kind}{failure.status ? ` · HTTP ${failure.status}` : ''}</Text>{__DEV__ && editorUrl ? <Text selectable className="mt-3 text-center text-xs" style={{ color: colors.secondaryText }}>{editorUrl}</Text> : null}<View className="mt-5 flex-row gap-3"><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} className="min-w-24 items-center rounded-xl border px-4 py-3" style={{ borderColor: colors.border }}><Text className="font-bold" style={{ color: colors.text }}>Back</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Retry Whiteboard" onPress={retry} className="min-w-24 items-center rounded-xl px-4 py-3" style={{ backgroundColor: colors.accent }}><Text className="font-bold" style={{ color: colors.accentText }}>Retry</Text></Pressable></View></View> : null}</> : null}</View><Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}><View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.32)' }}><Pressable className="flex-1" accessibilityLabel="Close actions" onPress={() => setMenuOpen(false)} /><View className="rounded-t-3xl px-5 pt-4" style={{ backgroundColor: colors.surfaceElevated, paddingBottom: Math.max(insets.bottom, 12) + 12 }}><View className="mb-4 h-1 self-center rounded-full" style={{ width: 36, backgroundColor: colors.border }} /><Text className="mb-3 text-lg font-black" style={{ color: colors.text }}>Whiteboard actions</Text><Pressable accessibilityRole="button" accessibilityLabel={role === 'owner' ? 'Close whiteboard' : 'Leave whiteboard'} onPress={() => void leave()} className="min-h-12 justify-center rounded-xl px-4 py-3" style={{ backgroundColor: colors.input }}><Text className="font-bold" style={{ color: role === 'owner' ? colors.text : colors.error }}>{role === 'owner' ? 'Done' : 'Leave whiteboard'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Close actions" onPress={() => setMenuOpen(false)} className="mt-2 min-h-12 justify-center rounded-xl px-4 py-3"><Text className="text-center font-bold" style={{ color: colors.secondaryText }}>Cancel</Text></Pressable></View></View></Modal></SafeAreaView>
}
