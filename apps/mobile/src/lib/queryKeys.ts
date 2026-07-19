export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    list: (filters: object = {}) => ['tasks', 'list', filters] as const,
    detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
    filterSummary: ['tasks', 'filter-summary'] as const,
    sharedIds: ['tasks', 'shared-ids'] as const,
  },
  dashboard: { summary: ['dashboard', 'summary'] as const },
  reminders: { list: ['reminders'] as const },
  focus: { stats: ['focus', 'stats'] as const },
  aiCollaboration: {
    capacity: (taskId: string) => ['aiCollaboration', 'capacity', taskId] as const,
    today: (taskId: string) => ['aiCollaboration', 'today', taskId] as const,
    progress: (taskId: string) => ['aiCollaboration', 'progress', taskId] as const,
    timeline: (taskId: string) => ['aiCollaboration', 'timeline', taskId] as const,
    suggestions: (taskId: string) => ['aiCollaboration', 'suggestions', taskId] as const,
  },
} as const;
