export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    list: (filters: object = {}) => ['tasks', 'list', filters] as const,
    detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
    filterSummary: ['tasks', 'filter-summary'] as const,
    sharedIds: ['tasks', 'shared-ids'] as const,
  },
  dashboard: { summary: ['dashboard', 'summary'] as const },
} as const
