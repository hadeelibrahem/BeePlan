export type AppScreen =
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'focusSession'
  | 'randomStart'
  | 'planner'
  | 'createTask'
  | 'aiPlanTask'
  | 'taskDetails'
  | 'editTask'
  | 'aiCollaboration'
  | 'list'
  | 'create'
  | 'details'
  | 'edit'
  | 'calendar'
  | 'notes'
  | 'whiteboard'
  | 'whiteboards'
  | 'whiteboardEditor'
  | 'analytics'
  | 'achievements'
  | 'social'
  | 'notifications'
  | 'settings'
  | 'notFound'

export type AppRoute = { screen: AppScreen; taskId?: string; reminderId?: string; boardId?: string }

const STATIC_ROUTES: Record<string, AppScreen> = {
  '/': 'dashboard',
  '/sign-in': 'dashboard',
  '/dashboard': 'dashboard',
  '/tasks': 'tasks',
  '/tasks/new': 'createTask',
  '/tasks/ai': 'aiPlanTask',
  '/focus': 'focus',
  '/focus/session': 'focusSession',
  '/random-start': 'randomStart',
  '/planner': 'planner',
  '/reminders': 'list',
  '/reminders/new': 'create',
  '/calendar': 'calendar',
  '/notes': 'notes',
  '/whiteboard': 'whiteboard',
  '/whiteboards': 'whiteboards',
  '/analytics': 'analytics',
  '/achievements': 'achievements',
  '/people': 'social',
  '/notifications': 'notifications',
  '/settings': 'settings',
}

export function resolveAppRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const staticScreen = STATIC_ROUTES[normalized]
  if (staticScreen) return { screen: staticScreen }

  const whiteboard = normalized.match(/^\/whiteboards\/([^/]+)$/)
  if (whiteboard) return { screen: 'whiteboardEditor', boardId: decodeURIComponent(whiteboard[1]) }

  const task = normalized.match(/^\/tasks\/([^/]+)(?:\/(edit|collaboration))?$/)
  if (task) {
    return {
      screen: task[2] === 'edit' ? 'editTask' : task[2] === 'collaboration' ? 'aiCollaboration' : 'taskDetails',
      taskId: decodeURIComponent(task[1]),
    }
  }

  const reminder = normalized.match(/^\/reminders\/([^/]+)(?:\/edit)?$/)
  if (reminder) {
    return {
      screen: normalized.endsWith('/edit') ? 'edit' : 'details',
      reminderId: decodeURIComponent(reminder[1]),
    }
  }

  return { screen: 'notFound' }
}

export function pathForScreen(screen: Exclude<AppScreen, 'notFound'>, ids: { taskId?: string | null; reminderId?: string | null; boardId?: string | null } = {}) {
  switch (screen) {
    case 'dashboard': return '/dashboard'
    case 'tasks': return '/tasks'
    case 'createTask': return '/tasks/new'
    case 'aiPlanTask': return '/tasks/ai'
    case 'taskDetails': return ids.taskId ? `/tasks/${encodeURIComponent(ids.taskId)}` : '/tasks'
    case 'editTask': return ids.taskId ? `/tasks/${encodeURIComponent(ids.taskId)}/edit` : '/tasks'
    case 'aiCollaboration': return ids.taskId ? `/tasks/${encodeURIComponent(ids.taskId)}/collaboration` : '/tasks'
    case 'focus': return '/focus'
    case 'focusSession': return '/focus/session'
    case 'randomStart': return '/random-start'
    case 'planner': return '/planner'
    case 'list': return '/reminders'
    case 'create': return '/reminders/new'
    case 'details': return ids.reminderId ? `/reminders/${encodeURIComponent(ids.reminderId)}` : '/reminders'
    case 'edit': return ids.reminderId ? `/reminders/${encodeURIComponent(ids.reminderId)}/edit` : '/reminders'
    case 'calendar': return '/calendar'
    case 'notes': return '/notes'
    case 'whiteboard': return '/whiteboard'
    case 'whiteboards': return '/whiteboards'
    case 'whiteboardEditor': return ids.boardId ? `/whiteboards/${encodeURIComponent(ids.boardId)}` : '/whiteboards'
    case 'analytics': return '/analytics'
    case 'achievements': return '/achievements'
    case 'social': return '/people'
    case 'notifications': return '/notifications'
    case 'settings': return '/settings'
  }
}
