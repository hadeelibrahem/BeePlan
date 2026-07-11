import { useCallback, useEffect, useState } from 'react'
import type { ApiTask } from '../../../lib/tasksApi'
import {
  getMembers,
  removeMember as apiRemoveMember,
  transferOwnership as apiTransferOwnership,
  updateMemberRole,
} from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'
import type { TaskMember, TaskRole } from '../types'
import { ActivityTimeline } from './ActivityTimeline'
import { CommentsSection } from './CommentsSection'
import { InviteMemberModal } from './InviteMemberModal'
import { MembersSection } from './MembersSection'
import { MyPreferencesSection } from './MyPreferencesSection'
import { Toast } from './Toast'

type Props = {
  task: ApiTask
  accessToken: string
  currentUserId: string
  /** Called after changes that affect visibility/roles so the parent can refetch. */
  onRefresh?: () => void
  /** Reports the accepted-member count so the header can show "• N Members". */
  onMembersLoaded?: (count: number) => void
}

export function CollaborationPanel({
  task,
  accessToken,
  currentUserId,
  onRefresh,
  onMembersLoaded,
}: Props) {
  const [members, setMembers] = useState<TaskMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const canManage = task.viewerRole === 'owner' || task.canManageMembers === true

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true)
    try {
      const rows = await getMembers(task.id, accessToken)
      setMembers(rows)
      onMembersLoaded?.(rows.filter((m) => m.status === 'accepted').length)
    } catch {
      // A non-shared personal task may 404 members before any invite; treat as
      // just the owner so the Invite entry point still renders.
      setMembers([])
      onMembersLoaded?.(0)
    } finally {
      setLoadingMembers(false)
    }
  }, [task.id, accessToken, onMembersLoaded])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const handleChangeRole = useCallback(
    async (member: TaskMember, role: Exclude<TaskRole, 'owner'>) => {
      const previous = members
      setMembers((prev) =>
        prev.map((m) => (m.userId === member.userId ? { ...m, role } : m)),
      ) // optimistic
      try {
        await updateMemberRole(task.id, member.userId, role, accessToken)
        setNotice(`${member.user.fullName} is now a ${role}.`)
      } catch (err) {
        setMembers(previous) // rollback
        setError(friendlyError(err, 'Could not change the role.'))
      }
    },
    [members, task.id, accessToken],
  )

  const handleRemove = useCallback(
    async (member: TaskMember) => {
      const previous = members
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId)) // optimistic
      try {
        await apiRemoveMember(task.id, member.userId, accessToken)
        setNotice(`${member.user.fullName} was removed.`)
      } catch (err) {
        setMembers(previous) // rollback
        setError(friendlyError(err, 'Could not remove the member.'))
      }
    },
    [members, task.id, accessToken],
  )

  const handleTransfer = useCallback(
    async (member: TaskMember) => {
      try {
        await apiTransferOwnership(task.id, member.userId, accessToken)
        setNotice(`${member.user.fullName} is now the owner.`)
        await loadMembers()
        onRefresh?.()
      } catch (err) {
        setError(friendlyError(err, 'Could not transfer ownership.'))
      }
    },
    [task.id, accessToken, loadMembers, onRefresh],
  )

  const memberIds = members.map((m) => m.userId)

  return (
    <div className="space-y-4">
      <MembersSection
        members={members}
        loading={loadingMembers}
        canManage={canManage}
        currentUserId={currentUserId}
        onInviteClick={() => setInviteOpen(true)}
        onChangeRole={(m, role) => void handleChangeRole(m, role)}
        onRemove={(m) => void handleRemove(m)}
        onTransfer={(m) => void handleTransfer(m)}
      />

      <MyPreferencesSection
        taskId={task.id}
        accessToken={accessToken}
        canEditShared={task.viewerRole === 'owner' || task.viewerRole === 'editor' || task.canEdit === true}
        onError={setError}
        onNotice={setNotice}
      />

      <CommentsSection
        taskId={task.id}
        accessToken={accessToken}
        members={members}
        currentUserId={currentUserId}
        onError={setError}
      />

      <section
        className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
        aria-label="Activity"
      >
        <h3 className="mb-3 text-sm font-black">Activity</h3>
        <ActivityTimeline activities={task.activities ?? []} />
      </section>

      {inviteOpen ? (
        <InviteMemberModal
          taskId={task.id}
          accessToken={accessToken}
          existingMemberIds={memberIds}
          onClose={() => setInviteOpen(false)}
          onInvited={(member, name) => {
            setInviteOpen(false)
            setMembers((prev) => [...prev.filter((m) => m.userId !== member.userId), member])
            setNotice(`Invitation sent to ${name}.`)
            onRefresh?.()
          }}
        />
      ) : null}

      <Toast message={notice} tone="success" onDone={() => setNotice('')} />
      <Toast message={error} tone="error" onDone={() => setError('')} />
    </div>
  )
}
