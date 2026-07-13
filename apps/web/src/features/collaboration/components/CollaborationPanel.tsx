import { useCallback, useEffect, useState } from 'react'
import type { ApiTask } from '../../../lib/tasksApi'
import { getMembers } from '../api/collaboration.api'
import type { TaskMember } from '../types'
import { CommentsSection } from './CommentsSection'
import { MembersSection } from './MembersSection'
import { Toast } from './Toast'

type Props = {
  task: ApiTask
  accessToken: string
  currentUserId: string
  /** Reports the accepted-member count so the header can show "• N Members". */
  onMembersLoaded?: (count: number) => void
}

/**
 * Read-only collaboration surface for the Task Details page: members (list
 * only) and comments. All member management (invite / role / remove /
 * transfer) lives on the Edit Task screen via {@link ManageMembersSection};
 * reminder and focus audience preferences live there too via
 * {@link ReminderAudienceSection} and {@link FocusAudienceSection}.
 */
export function CollaborationPanel({
  task,
  accessToken,
  currentUserId,
  onMembersLoaded,
}: Props) {
  const [members, setMembers] = useState<TaskMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [error, setError] = useState('')

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true)
    try {
      const rows = await getMembers(task.id, accessToken)
      setMembers(rows)
      onMembersLoaded?.(rows.filter((m) => m.status === 'accepted').length)
    } catch {
      // A non-shared personal task may 404 members before any invite; treat as
      // empty so the list simply shows nothing extra.
      setMembers([])
      onMembersLoaded?.(0)
    } finally {
      setLoadingMembers(false)
    }
  }, [task.id, accessToken, onMembersLoaded])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const noop = () => {}

  return (
    <div className="space-y-4">
      <MembersSection
        members={members}
        loading={loadingMembers}
        canManage={false}
        currentUserId={currentUserId}
        onInviteClick={noop}
        onChangeRole={noop}
        onRemove={noop}
        onTransfer={noop}
      />

      <CommentsSection
        taskId={task.id}
        accessToken={accessToken}
        members={members}
        currentUserId={currentUserId}
        onError={setError}
      />

      <Toast message={error} tone="error" onDone={() => setError('')} />
    </div>
  )
}
