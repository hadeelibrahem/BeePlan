import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import type { ProjectPlanEdge, ProjectPlanNode, ProjectPlanSchedule, ResourceLane } from '../../api/project-plan.api'
import { NODE_HEIGHT, NODE_WIDTH, filterNodeIds, layoutGraph, nodeResourceFlags, overloadedAssigneeIds, relatedPath, type PlanFilters } from '../../lib/project-plan.view'

type Props = { nodes: ProjectPlanNode[]; edges: ProjectPlanEdge[]; filters: PlanFilters; selectedId: string | null; onSelect: (id: string) => void; scheduling: Record<string, ProjectPlanSchedule>; lanes: ResourceLane[]; highlightCritical: boolean; currentUserId?: string | null }
type Transform = { x: number; y: number; k: number }
type ViewMode = 'parents' | 'expanded' | 'full'
type QuickFilter = 'all' | 'mine' | 'blocked' | 'critical' | 'overdue' | 'completed' | 'parents'

const MIN_SCALE = 0.28
const MAX_SCALE = 2.5
const PADDING = 40
const DEFAULT_VIEWPORT = { w: 800, h: 560 }
const STATUS_COLOR: Record<string, string> = { todo: '#94a3b8', in_progress: '#38bdf8', done: '#34d399', missed: '#fb7185' }

/**
 * A semantic, progressively disclosed projection of the existing dependency
 * model. Grouping, filters and layout are view concerns only: source nodes and
 * edges are never changed, and selecting an execution item still uses its
 * original id.
 */
export function DependencyGraphView({ nodes, edges, filters, selectedId, onSelect, scheduling, lanes, highlightCritical, currentUserId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origin: Transform } | null>(null)
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT)
  const [transform, setTransform] = useState<Transform>({ x: PADDING, y: PADDING, k: 1 })
  const [viewMode, setViewMode] = useState<ViewMode>('parents')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => new Set())
  const overloadedIds = useMemo(() => overloadedAssigneeIds(lanes), [lanes])
  const matchingIds = useMemo(() => filterNodeIds(nodes, filters), [nodes, filters])
  const graph = useMemo(() => buildGraphProjection(nodes, edges, matchingIds, viewMode, expandedParents, quickFilter, scheduling, currentUserId), [nodes, edges, matchingIds, viewMode, expandedParents, quickFilter, scheduling, currentUserId])
  const layout = useMemo(() => layoutGraph(graph.nodes), [graph.nodes])
  const path = useMemo(() => (selectedId && graph.originalIds.has(selectedId) ? relatedPath(selectedId, edges) : null), [selectedId, graph.originalIds, edges])
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? null, [nodes, selectedId])

  useLayoutEffect(() => {
    const measure = () => { const el = containerRef.current; if (el?.clientWidth) setViewport({ w: el.clientWidth, h: el.clientHeight || DEFAULT_VIEWPORT.h }) }
    measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure)
  }, [])
  useEffect(() => { fitToScreen() }, [graph.nodes.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2) }
      if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2) }
      if (event.key === '0') { event.preventDefault(); resetZoom() }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); fitToScreen() }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); zoomToSelected() }
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  })

  function fitToScreen() {
    const scale = Math.max(MIN_SCALE, Math.min((viewport.w - PADDING * 2) / Math.max(1, layout.width), (viewport.h - PADDING * 2) / Math.max(1, layout.height), 1))
    setTransform({ x: (viewport.w - layout.width * scale) / 2, y: Math.max(PADDING, (viewport.h - layout.height * scale) / 2), k: scale })
  }
  function resetZoom() { setTransform({ x: PADDING, y: PADDING, k: 1 }) }
  function zoomBy(factor: number) {
    setTransform((prev) => { const k = clamp(prev.k * factor, MIN_SCALE, MAX_SCALE); const cx = viewport.w / 2; const cy = viewport.h / 2; return { k, x: cx - ((cx - prev.x) / prev.k) * k, y: cy - ((cy - prev.y) / prev.k) * k } })
  }
  function zoomToSelected() {
    if (!selectedId) return
    const displayId = graph.displayIdByOriginal.get(selectedId) ?? selectedId
    const point = layout.positions.get(displayId)
    if (!point) return
    const k = Math.max(1, transform.k)
    setTransform({ k, x: viewport.w / 2 - (point.x + NODE_WIDTH / 2) * k, y: viewport.h / 2 - (point.y + NODE_HEIGHT / 2) * k })
  }
  function onWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault(); const rect = containerRef.current?.getBoundingClientRect(); const px = rect ? event.clientX - rect.left : viewport.w / 2; const py = rect ? event.clientY - rect.top : viewport.h / 2; const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
    setTransform((prev) => { const k = clamp(prev.k * factor, MIN_SCALE, MAX_SCALE); return { k, x: px - ((px - prev.x) / prev.k) * k, y: py - ((py - prev.y) / prev.k) * k } })
  }
  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) { if (event.button !== 0) return; dragState.current = { startX: event.clientX, startY: event.clientY, origin: transform }; (event.target as Element).setPointerCapture?.(event.pointerId) }
  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) { const drag = dragState.current; if (drag) setTransform({ ...drag.origin, x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY }) }
  function select(display: DisplayNode) {
    if (display.groupFor && viewMode !== 'full') { setExpandedParents((current) => { const next = new Set(current); next.has(display.groupFor!) ? next.delete(display.groupFor!) : next.add(display.groupFor!); return next }); return }
    if (display.originalIds[0]) onSelect(display.originalIds[0])
  }
  const semantic = transform.k < 0.58 ? 'compact' : transform.k < 1.05 ? 'medium' : 'detail'

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" aria-label="Graph viewing mode">
          <ModeButton active={viewMode === 'parents'} onClick={() => setViewMode('parents')}>Parent tasks</ModeButton>
          <ModeButton active={viewMode === 'expanded'} onClick={() => setViewMode('expanded')}>Parent + expanded</ModeButton>
          <ModeButton active={viewMode === 'full'} onClick={() => setViewMode('full')}>Full graph</ModeButton>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Graph quick filters">
          {([['all', 'All'], ['mine', 'My tasks'], ['blocked', 'Blocked'], ['critical', 'Critical'], ['overdue', 'Overdue'], ['completed', 'Completed'], ['parents', 'Parent tasks only']] as const).map(([value, label]) => <ModeButton key={value} active={quickFilter === value} onClick={() => setQuickFilter(value)}>{label}</ModeButton>)}
        </div>
      </div>
      <div className="absolute end-2 top-[58px] z-10 flex gap-1">
        <GraphButton label="Fit to screen" onClick={fitToScreen}>Fit</GraphButton>
        <GraphButton label="Reset zoom (0)" onClick={resetZoom}>1:1</GraphButton>
        <GraphButton label="Zoom to selected node (S)" onClick={zoomToSelected} disabled={!selectedId}>◎</GraphButton>
        <GraphButton label="Zoom in (+)" onClick={() => zoomBy(1.2)}>+</GraphButton>
        <GraphButton label="Zoom out (-)" onClick={() => zoomBy(1 / 1.2)}>−</GraphButton>
      </div>
      <div ref={containerRef} tabIndex={0} className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]">
        <svg role="img" aria-label="Dependency graph" width="100%" height="100%" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragState.current = null }} onPointerLeave={() => { dragState.current = null }} style={{ cursor: dragState.current ? 'grabbing' : 'grab', touchAction: 'none' }}>
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            {graph.edges.map((edge) => {
              const s = layout.positions.get(edge.sourceId); const t = layout.positions.get(edge.targetId); if (!s || !t) return null
              const active = path ? edge.originalIds.some((id) => path.all.has(id)) : true
              const mid = (s.x + NODE_WIDTH + t.x) / 2
              return <path key={edge.id} d={`M ${s.x + NODE_WIDTH} ${s.y + NODE_HEIGHT / 2} C ${mid} ${s.y + NODE_HEIGHT / 2}, ${mid} ${t.y + NODE_HEIGHT / 2}, ${t.x} ${t.y + NODE_HEIGHT / 2}`} fill="none" stroke={active ? 'var(--bp-accent)' : 'var(--bp-border)'} strokeWidth={active ? 2 : 1} strokeDasharray={edge.crossTask ? '5 4' : undefined} opacity={active ? 0.88 : 0.18} />
            })}
            {layout.laidOut.map(({ node, x, y }) => {
              const display = node as DisplayNode
              const selected = display.originalIds.includes(selectedId ?? '')
              const related = !path || display.originalIds.some((id) => path.all.has(id))
              const critical = display.originalIds.some((id) => scheduling[id]?.isCritical)
              const dimmed = !related || (highlightCritical && !critical)
              const accent = display.isBlocked ? '#f87171' : STATUS_COLOR[display.status] ?? '#94a3b8'
              const owner = display.assignee?.displayName ?? 'Unassigned'
              const resource = display.originalIds.map((id) => nodeResourceFlags(nodes.find((item) => item.id === id) ?? display, scheduling[id], overloadedIds)).find((flags) => flags.forecastUnscheduled || flags.overCapacity || flags.resourceDelayed)
              const resourceBadge = resource?.forecastUnscheduled ? 'Unscheduled' : resource?.overCapacity ? 'Over capacity' : resource?.resourceDelayed ? 'Resource delayed' : null
              return <g key={display.id} transform={`translate(${x} ${y})`} onClick={(event) => { event.stopPropagation(); select(display) }} style={{ cursor: 'pointer' }} opacity={dimmed ? 0.18 : 1}>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={12} fill="var(--bp-card)" stroke={selected ? 'var(--bp-accent)' : critical || display.isBlocked ? '#f87171' : accent} strokeWidth={selected ? 3 : 1.25} />
                <rect width={6} height={NODE_HEIGHT} rx={3} fill={accent} />
                <text x={16} y={semantic === 'compact' ? 42 : 24} fontSize={semantic === 'compact' ? 13 : 12} fontWeight={800} fill="var(--bp-text)">{display.groupFor ? `${expandedParents.has(display.groupFor) ? '▾' : '▸'} ${truncate(display.title, 22)} (${display.originalIds.length})` : truncate(display.title, 24)}</text>
                {semantic !== 'compact' ? <><circle cx={18} cy={43} r={4} fill={accent} /><text x={28} y={47} fontSize={10} fill="var(--bp-muted)">{semantic === 'medium' ? truncate(owner, 16) : `${statusLabel(display.status)} · ${truncate(owner, 16)}`}</text></> : null}
                {semantic === 'detail' ? <text x={16} y={65} fontSize={10} fill={display.isBlocked ? '#f87171' : 'var(--bp-muted)'}>{critical ? 'Critical path' : display.isBlocked ? 'Blocked' : `${display.progressPercent}% complete`}</text> : null}
                {semantic === 'detail' && resourceBadge ? <text x={NODE_WIDTH - 10} y={16} textAnchor="end" fontSize={9} fontWeight={800} fill={resource?.forecastUnscheduled ? '#fbbf24' : '#f87171'}>{resourceBadge}</text> : null}
              </g>
            })}
          </g>
        </svg>
        <MiniMap layout={layout} transform={transform} viewport={viewport} onNavigate={(point) => setTransform((current) => ({ ...current, x: viewport.w / 2 - point.x * current.k, y: viewport.h / 2 - point.y * current.k }))} />
        {selectedNode ? <SelectionPanel node={selectedNode} nodes={nodes} scheduling={scheduling} onClose={() => onSelect('')} /> : null}
      </div>
      <p className="mt-2 text-[11px] text-[var(--bp-muted)]">Drag to pan · wheel to zoom at the cursor · F fit · 0 reset · S selected. At lower zoom, cards intentionally show titles only.</p>
    </div>
  )
}

type DisplayNode = ProjectPlanNode & { originalIds: string[]; groupFor?: string }
type DisplayEdge = { id: string; sourceId: string; targetId: string; originalIds: string[]; crossTask: boolean }

function buildGraphProjection(nodes: ProjectPlanNode[], edges: ProjectPlanEdge[], matchingIds: Set<string>, mode: ViewMode, expanded: Set<string>, quick: QuickFilter, scheduling: Record<string, ProjectPlanSchedule>, currentUserId?: string | null) {
  const isOverdue = (node: ProjectPlanNode) => Boolean(node.dueDate && node.status !== 'done' && new Date(node.dueDate).getTime() < Date.now())
  const passesQuick = (node: ProjectPlanNode) => quick === 'all' || quick === 'parents' || (quick === 'mine' && Boolean(currentUserId && node.assignee?.userId === currentUserId)) || (quick === 'blocked' && node.isBlocked) || (quick === 'critical' && scheduling[node.id]?.isCritical) || (quick === 'overdue' && isOverdue(node)) || (quick === 'completed' && node.status === 'done')
  const base = nodes.filter((node) => matchingIds.has(node.id) && passesQuick(node))
  const children = new Map<string, ProjectPlanNode[]>()
  for (const node of base) if (node.entityType === 'subtask' && node.parentTaskId) children.set(node.parentTaskId, [...(children.get(node.parentTaskId) ?? []), node])
  const anchorById = new Map(nodes.filter((node) => node.isGroup).map((node) => [node.id, node]))
  const displayIdByOriginal = new Map<string, string>()
  const displayNodes: DisplayNode[] = []
  for (const node of base) {
    const siblings = node.parentTaskId ? children.get(node.parentTaskId) : undefined
    const grouped = node.entityType === 'subtask' && siblings && siblings.length > 1 && mode !== 'full' && !expanded.has(node.parentTaskId!)
    if (!grouped) { displayIdByOriginal.set(node.id, node.id); displayNodes.push({ ...node, originalIds: [node.id] }); continue }
    const groupId = `group:${node.parentTaskId}`
    displayIdByOriginal.set(node.id, groupId)
    if (displayNodes.some((entry) => entry.id === groupId)) continue
    const anchor = anchorById.get(node.parentTaskId!)
    displayNodes.push({ ...(anchor ?? node), id: groupId, title: anchor?.title ?? 'Current task', entityType: 'task', parentTaskId: null, isGroup: true, originalIds: siblings.map((item) => item.id), groupFor: node.parentTaskId ?? undefined, isBlocked: siblings.some((item) => item.isBlocked), progressPercent: Math.round(siblings.reduce((sum, item) => sum + item.progressPercent, 0) / siblings.length) })
  }
  const ids = new Set(displayNodes.map((node) => node.id))
  const edgeByPair = new Map<string, DisplayEdge>()
  for (const edge of edges) { const sourceId = displayIdByOriginal.get(edge.sourceId); const targetId = displayIdByOriginal.get(edge.targetId); if (!sourceId || !targetId || sourceId === targetId || !ids.has(sourceId) || !ids.has(targetId)) continue; const key = `${sourceId}->${targetId}`; const current = edgeByPair.get(key); if (current) current.originalIds.push(edge.id); else edgeByPair.set(key, { id: key, sourceId, targetId, originalIds: [edge.id], crossTask: edge.dependencyType === 'cross_task' }) }
  return { nodes: quick === 'parents' ? displayNodes.filter((node) => Boolean(node.groupFor) || node.entityType === 'task') : displayNodes, edges: [...edgeByPair.values()], originalIds: new Set(base.map((node) => node.id)), displayIdByOriginal }
}

function SelectionPanel({ node, nodes, scheduling, onClose }: { node: ProjectPlanNode; nodes: ProjectPlanNode[]; scheduling: Record<string, ProjectPlanSchedule>; onClose: () => void }) {
  const byId = new Map(nodes.map((item) => [item.id, item]))
  const labels = (ids: string[]) => ids.map((id) => byId.get(id)?.title ?? 'Unknown item').join(', ') || 'None'
  return <aside aria-label="Selected task details" className="absolute bottom-3 end-3 z-10 w-72 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)]/95 p-3 shadow-lg backdrop-blur">
    <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Selected item</p><h4 className="text-sm font-black text-[var(--bp-text)]">{node.title}</h4></div><button type="button" onClick={onClose} aria-label="Close selected task details" className="text-[var(--bp-muted)] hover:text-[var(--bp-text)]">×</button></div>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs"><Field label="Status">{statusLabel(node.status)}</Field><Field label="Assignee">{node.assignee?.displayName ?? 'Unassigned'}</Field><Field label="Estimated">{node.estimatedMinutes != null ? `${node.estimatedMinutes} min` : '—'}</Field><Field label="Progress">{node.progressPercent}%</Field></dl>
    <p className="mt-2 border-t border-[var(--bp-border)]/70 pt-2 text-[11px] text-[var(--bp-muted)]"><b className="text-[var(--bp-text)]">Depends on:</b> {labels(node.blockedByIds)}</p>
    <p className="mt-1 text-[11px] text-[var(--bp-muted)]"><b className="text-[var(--bp-text)]">Blocking:</b> {labels(node.blockingIds)}</p>
    {scheduling[node.id]?.isCritical ? <p className="mt-2 text-[11px] font-bold text-red-300">Critical path item</p> : null}
  </aside>
}
function MiniMap({ layout, transform, viewport, onNavigate }: { layout: ReturnType<typeof layoutGraph>; transform: Transform; viewport: { w: number; h: number }; onNavigate: (point: { x: number; y: number }) => void }) {
  const width = 126; const height = 82; const k = Math.min((width - 8) / Math.max(1, layout.width), (height - 8) / Math.max(1, layout.height)); const viewX = (-transform.x / transform.k) * k; const viewY = (-transform.y / transform.k) * k
  return <svg aria-label="Graph minimap" className="absolute bottom-3 start-3 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card)]/90" width={width} height={height} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onNavigate({ x: (event.clientX - rect.left) / k, y: (event.clientY - rect.top) / k }) }}>
    {layout.laidOut.map(({ node, x, y }) => <rect key={node.id} x={x * k + 3} y={y * k + 3} width={Math.max(4, NODE_WIDTH * k)} height={Math.max(3, NODE_HEIGHT * k)} rx="1" fill="var(--bp-accent)" opacity=".8" />)}
    <rect x={viewX} y={viewY} width={(viewport.w / transform.k) * k} height={(viewport.h / transform.k) * k} fill="none" stroke="var(--bp-text)" strokeWidth="1" opacity=".55" />
  </svg>
}
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]' : 'border-[var(--bp-border)] bg-[var(--bp-card)] text-[var(--bp-muted)] hover:text-[var(--bp-text)]'}`}>{children}</button> }
function GraphButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) { return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="h-8 min-w-8 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card)] px-2 text-xs font-black text-[var(--bp-text)] hover:bg-[var(--bp-border)] disabled:cursor-not-allowed disabled:opacity-45">{children}</button> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><dt className="text-[9px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</dt><dd className="font-semibold text-[var(--bp-text)]">{children}</dd></div> }
function statusLabel(status: string) { return ({ todo: 'To do', in_progress: 'In progress', done: 'Done', missed: 'Missed' } as Record<string, string>)[status] ?? status }
function truncate(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
