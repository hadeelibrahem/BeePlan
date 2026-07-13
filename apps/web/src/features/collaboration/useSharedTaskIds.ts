import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTasks } from '../../lib/tasksApi'
import { queryKeys } from '../../lib/queryKeys'

/**
 * Set of task ids the current user collaborates on as an accepted member
 * (i.e. tasks shared *with* them). Used to render the "👥 Shared" badge in
 * task lists without changing the list endpoint's response shape. Cached under
 * a stable key so every list screen shares one request.
 */
export function useSharedTaskIds(accessToken: string | null | undefined): Set<string> {
  const query = useQuery({
    queryKey: queryKeys.tasks.sharedIds,
    queryFn: () => getTasks(accessToken ?? '', { shared: true }),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  })

  return useMemo(
    () => new Set((query.data ?? []).map((task) => task.id)),
    [query.data],
  )
}
