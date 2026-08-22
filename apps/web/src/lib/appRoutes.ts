export type AppScreen =
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'focusSession'
  | 'focusRooms'
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
  | 'analytics'
  | 'whiteboard'
  | 'whiteboards'
  | 'whiteboardEditor'
  | 'achievements'
  | 'social'
  | 'feedback'
  | 'challenges'
  | 'notifications'
  | 'settings'
  | 'timeCapsules'
  | 'supervision'
  | 'notFound'

export type AppRoute = { screen: AppScreen; taskId?: string; reminderId?: string; roomId?: string; boardId?: string; feedbackId?: string }

const STATIC_ROUTES: Record<string, AppScreen> = {
  '/': 'dashboard',
  '/sign-in': 'dashboard',
  '/dashboard': 'dashboard',
  '/tasks': 'tasks',
  '/tasks/new': 'createTask',
  '/tasks/ai': 'aiPlanTask',
  '/focus': 'focus',
  '/focus/session': 'focusSession',
  '/focus/rooms': 'focusRooms',
  '/random-start': 'randomStart',
  '/planner': 'planner',
  '/reminders': 'list',
  '/reminders/new': 'create',
  '/calendar': 'calendar',
  '/notes': 'notes',
  '/analytics': 'analytics',
  '/whiteboard': 'whiteboard',
  '/whiteboards': 'whiteboards',
  '/achievements': 'achievements',
  '/people': 'social',
  '/feedback': 'feedback',
  '/challenges': 'challenges',
  '/notifications': 'notifications',
  '/settings': 'settings',
  '/time-capsules': 'timeCapsules',
  '/supervision': 'supervision',
}

export function resolveAppRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const staticScreen = STATIC_ROUTES[normalized]
  if (staticScreen) return { screen: staticScreen }

  const focusRoom = normalized.match(/^\/focus\/rooms\/([^/]+)$/)
  if (focusRoom) return { screen: 'focusRooms', roomId: decodeURIComponent(focusRoom[1]) }
  const whiteboard = normalized.match(/^\/whiteboards\/([^/]+)$/)
  if (whiteboard) return { screen: 'whiteboardEditor', boardId: decodeURIComponent(whiteboard[1]) }
  const feedback = normalized.match(/^\/feedback\/([^/]+)$/)
  if (feedback) return { screen: 'feedback', feedbackId: decodeURIComponent(feedback[1]) }
  if (normalized.match(/^\/challenges\/([^/]+)$/)) return { screen: 'challenges', feedbackId: decodeURIComponent(normalized.split('/').pop()!) }

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
    case 'focusRooms': return '/focus/rooms'
    case 'randomStart': return '/random-start'
    case 'planner': return '/planner'
    case 'list': return '/reminders'
    case 'create': return '/reminders/new'
    case 'details': return ids.reminderId ? `/reminders/${encodeURIComponent(ids.reminderId)}` : '/reminders'
    case 'edit': return ids.reminderId ? `/reminders/${encodeURIComponent(ids.reminderId)}/edit` : '/reminders'
    case 'calendar': return '/calendar'
    case 'notes': return '/notes'
    case 'analytics': return '/analytics'
    case 'social': return '/people'
    case 'feedback': return '/feedback'
    case 'challenges': return '/challenges'
    case 'notifications': return '/notifications'
    case 'settings': return '/settings'
    case 'timeCapsules': return '/time-capsules'
    case 'supervision': return '/supervision'
    case 'whiteboard': return '/whiteboard'
    case 'whiteboards': return '/whiteboards'
    case 'whiteboardEditor': return ids.boardId ? `/whiteboards/${encodeURIComponent(ids.boardId)}` : '/whiteboards'
    case 'achievements': return '/achievements'
  }
}
