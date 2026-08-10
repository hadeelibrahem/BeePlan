import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeEditTask } from './editTaskData'

const appSource = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8')
const navigatorSource = readFileSync(resolve(__dirname, 'RootNavigator.tsx'), 'utf8')
const routeSource = readFileSync(resolve(__dirname, 'EditTaskRoute.tsx'), 'utf8')

const task = {
  id: 'task-edit-1', title: 'Prepare presentation', description: 'Existing description', priority: 'high', status: 'in_progress', progress: 25,
  dueTime: '18:30', scheduledDate: '2026-08-10', scheduledStartTime: '17:00', scheduledEndTime: '18:00',
  destination: { displayName: 'BeePlan HQ', latitude: 32.22, longitude: 35.25 }, category: 'Work', notes: 'Existing notes',
  estimatedTimeMinutes: 90, spentTimeMinutes: 15, remainingTimeMinutes: 75, estimatedHours: 1.5, spentHours: 0.25,
  remainingHours: 1.25, progressPercentage: 25, reminderEnabled: true, reminderBeforeMinutes: 30, labels: [], isFavorite: false,
  isFocusTask: true, isBlocked: false, dependenciesComplete: true, subtasks: [], dependencies: [], recurrence: null, activities: [], attachments: [],
  createdAt: '', updatedAt: '',
} as any

describe('Mobile Edit Task navigation and data handoff', () => {
  it('opens the registered root EditTask route with the Task Details taskId', () => {
    expect(appSource).toMatch(/navigate\('EditTask', \{ taskId: props\.route\.params\.taskId \}\)/)
    expect(navigatorSource).toMatch(/Stack\.Screen name="EditTask" component=\{EditTaskRoute\}/)
    expect(routeSource).toMatch(/route\.params\.taskId/)
  })

  it('keeps existing edit values and safely normalizes omitted detail collections', () => {
    const normalized = normalizeEditTask({ ...task, subtasks: undefined, dependencies: undefined })
    expect(normalized.id).toBe('task-edit-1')
    expect(normalized.status).toBe('in_progress')
    expect(normalized.destination?.displayName).toBe('BeePlan HQ')
    expect(normalized.scheduledDate).toBe('2026-08-10')
    expect(normalized.scheduledStartTime).toBe('17:00')
    expect(normalized.scheduledEndTime).toBe('18:00')
    expect(normalized.subtasks).toEqual([])
    expect(normalized.dependencies).toEqual([])
  })

  it('has diagnostics and a render boundary for every Edit Task failure stage', () => {
    for (const event of ['edit_task_pressed', 'edit_task_navigation', 'edit_task_screen_mounted', 'edit_task_load_started', 'edit_task_load_success', 'edit_task_load_failed', 'edit_task_render_error']) {
      expect(event === 'edit_task_pressed' || event === 'edit_task_navigation' ? appSource : routeSource).toContain(event)
    }
  })
})
