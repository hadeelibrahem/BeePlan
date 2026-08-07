import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T, useEditor, type TLShape } from 'tldraw'
import { useEffect, useState } from 'react'
import { getTaskSubtaskProgress } from './whiteboardTaskUtils'
import { useWhiteboardTaskContext } from './WhiteboardTaskContext'

export const BEEPLAN_TASK_SHAPE_TYPE = 'beeplan-task' as const

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'beeplan-task': { taskId: string; w: number; h: number }
  }
}

export type BeePlanTaskShape = TLShape<typeof BEEPLAN_TASK_SHAPE_TYPE>

function priorityLabel(priority: string) {
  return priority.replace('_', ' ')
}

function statusLabel(status: string) {
  return status.replace('_', ' ')
}

export class BeePlanTaskShapeUtil extends BaseBoxShapeUtil<BeePlanTaskShape> {
  static override type = BEEPLAN_TASK_SHAPE_TYPE
  static override props = {
    taskId: T.string,
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): BeePlanTaskShape['props'] {
    return { taskId: '', w: 360, h: 220 }
  }

  override getGeometry(shape: BeePlanTaskShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override component(shape: BeePlanTaskShape) {
    const editor = useEditor()
    const [isSelected, setIsSelected] = useState(() => editor.getSelectedShapeIds().includes(shape.id))
    useEffect(() => {
      const syncSelection = () => setIsSelected(editor.getSelectedShapeIds().includes(shape.id))
      syncSelection()
      return editor.store.listen(syncSelection)
    }, [editor, shape.id])

    const context = useWhiteboardTaskContext()
    const fullTask = context?.tasks.find((item) => item.id === shape.props.taskId)
    const taskCard = context?.taskCards[shape.props.taskId]
    const task = fullTask ?? taskCard
    const progress = fullTask ? getTaskSubtaskProgress(fullTask) : taskCard?.progress ?? null

    if (!context || (!task && (context.loading || context.taskCardsLoading))) {
      return <HTMLContainer className="pointer-events-none"><div className="h-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-sm text-[var(--bp-muted)]">Loading task...</div></HTMLContainer>
    }

    if (!task) {
      return <HTMLContainer className="pointer-events-none"><div className="h-full rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-sm text-[var(--bp-muted)]"><p>Task unavailable</p>{isSelected && <button type="button" className="pointer-events-auto mt-3 rounded-lg bg-[var(--bp-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--bp-accent-text)]" onPointerDown={(event) => event.stopPropagation()} onClick={() => context?.onRemoveShape(shape.id)}>Remove</button>}</div></HTMLContainer>
    }

    const completed = task.status === 'done'
    return (
      <HTMLContainer className="pointer-events-none">
        <article className="flex h-full flex-col rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-[var(--bp-text)] shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-sm font-bold">{task.title}</h3>
            <span className="shrink-0 rounded-full bg-[var(--bp-accent-soft)] px-2 py-1 text-[10px] font-semibold capitalize text-[var(--bp-accent)]">{priorityLabel(task.priority)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--bp-muted)]">
            <span>Status: <b className="capitalize text-[var(--bp-text)]">{statusLabel(task.status)}</b></span>
            <span>Due: <b className="text-[var(--bp-text)]">{task.dueDate || 'No date'}</b></span>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] text-[var(--bp-muted)]"><span>Subtasks</span><span>{progress?.completed ?? 0}/{progress?.total ?? 0}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bp-border)]"><div className="h-full bg-[var(--bp-accent)] transition-all" style={{ width: `${progress?.percentage ?? 0}%` }} /></div>
          </div>
          {isSelected && fullTask && <div className="pointer-events-auto mt-auto flex flex-wrap gap-2 pt-4">
            <button type="button" className="rounded-lg border border-[var(--bp-border)] px-2 py-1.5 text-[10px] font-semibold" onPointerDown={(event) => event.stopPropagation()} onClick={() => context.onOpenTask(fullTask.id)}>Open Task</button>
            {!completed && !fullTask.isBlocked && fullTask.dependenciesComplete !== false && <button type="button" className="rounded-lg border border-[var(--bp-border)] px-2 py-1.5 text-[10px] font-semibold" onPointerDown={(event) => event.stopPropagation()} onClick={() => void context.onStartFocus(fullTask)}>Start Focus</button>}
            <button type="button" disabled={context.busyTaskId === fullTask.id} className="rounded-lg bg-[var(--bp-accent)] px-2 py-1.5 text-[10px] font-semibold text-[var(--bp-accent-text)] disabled:opacity-50" onPointerDown={(event) => event.stopPropagation()} onClick={() => void context.onCompleteTask(fullTask)}>{context.busyTaskId === fullTask.id ? 'Saving...' : completed ? 'Reopen Task' : 'Complete Task'}</button>
          </div>}
        </article>
      </HTMLContainer>
    )
  }

  override getIndicatorPath(shape: BeePlanTaskShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }
}
