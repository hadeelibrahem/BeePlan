import { useState } from 'react'
import { FriendAvatar } from '../../social/components/FriendAvatar'
import { OutlineButton, PrimaryButton } from '../../../components/layout/Buttons'
import { RoleBadge } from './SharedBadge'
import type { TaskMember, TaskRole } from '../types'

type Props = {
  members: TaskMember[]
  loading?: boolean
  canManage: boolean
  currentUserId: string
  onInviteClick: () => void
  onChangeRole: (member: TaskMember, role: Exclude<TaskRole, 'owner'>) => void
  onRemove: (member: TaskMember) => void
  onTransfer: (member: TaskMember) => void
}

type Confirm = {
  kind: 'remove' | 'transfer'
  member: TaskMember
}

export function MembersSection({
  members,
  loading,
  canManage,
  currentUserId,
  onInviteClick,
  onChangeRole,
  onRemove,
  onTransfer,
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const accepted = members.filter((m) => m.status !== 'declined')

  return (
    <section
      className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
      aria-label="Members"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black">
          Members <span className="text-slate-400">({accepted.filter((m) => m.status === 'accepted').length})</span>
        </h3>
        {canManage ? (
          <PrimaryButton size="sm" onClick={onInviteClick}>
            + Invite
          </PrimaryButton>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bp-border)]/40" />
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {accepted.map((member) => {
            const canActOnThis = canManage && !member.isOwner && member.userId !== currentUserId
            return (
              <li
                key={member.userId}
                className="relative flex items-center gap-3 rounded-xl border border-[var(--bp-border)] px-3 py-2"
              >
                <FriendAvatar
                  fullName={member.user.fullName}
                  avatarUrl={member.user.avatarUrl}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-[var(--bp-text)]">
                      {member.user.fullName}
                      {member.userId === currentUserId ? (
                        <span className="text-slate-400"> (you)</span>
                      ) : null}
                    </span>
                    {member.status === 'pending' ? (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                        Pending
                      </span>
                    ) : null}
                  </div>
                  <span className="block truncate text-xs text-slate-400">{member.user.email}</span>
                </div>
                <RoleBadge role={member.role} />

                {canActOnThis ? (
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={`Manage ${member.user.fullName}`}
                      aria-haspopup="menu"
                      aria-expanded={menuFor === member.userId}
                      onClick={() => setMenuFor((cur) => (cur === member.userId ? null : member.userId))}
                      className="rounded-lg px-2 py-1 text-slate-400 hover:bg-[var(--bp-border)]/50 hover:text-[var(--bp-text)]"
                    >
                      ⋯
                    </button>
                    {menuFor === member.userId ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] py-1 shadow-2xl"
                      >
                        {member.role !== 'editor' ? (
                          <MenuItem
                            onClick={() => {
                              setMenuFor(null)
                              onChangeRole(member, 'editor')
                            }}
                          >
                            ✏️ Make editor
                          </MenuItem>
                        ) : null}
                        {member.role !== 'viewer' ? (
                          <MenuItem
                            onClick={() => {
                              setMenuFor(null)
                              onChangeRole(member, 'viewer')
                            }}
                          >
                            👁 Make viewer
                          </MenuItem>
                        ) : null}
                        {member.status === 'accepted' ? (
                          <MenuItem
                            onClick={() => {
                              setMenuFor(null)
                              setConfirm({ kind: 'transfer', member })
                            }}
                          >
                            👑 Transfer ownership
                          </MenuItem>
                        ) : null}
                        <MenuItem
                          danger
                          onClick={() => {
                            setMenuFor(null)
                            setConfirm({ kind: 'remove', member })
                          }}
                        >
                          🗑 Remove
                        </MenuItem>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {confirm ? (
        <ConfirmDialog
          confirm={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { kind, member } = confirm
            setConfirm(null)
            if (kind === 'remove') onRemove(member)
            else onTransfer(member)
          }}
        />
      ) : null}
    </section>
  )
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left text-xs font-semibold transition hover:bg-[var(--bp-border)]/50 ${
        danger ? 'text-red-300' : 'text-[var(--bp-text)]'
      }`}
    >
      {children}
    </button>
  )
}

function ConfirmDialog({
  confirm,
  onCancel,
  onConfirm,
}: {
  confirm: Confirm
  onCancel: () => void
  onConfirm: () => void
}) {
  const isRemove = confirm.kind === 'remove'
  const name = confirm.member.user.fullName
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 text-center shadow-2xl">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
            isRemove
              ? 'border border-red-500/40 bg-red-500/15'
              : 'border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/15'
          }`}
        >
          {isRemove ? '🗑' : '👑'}
        </div>
        <h2 className="text-lg font-black">
          {isRemove ? 'Remove member?' : 'Transfer ownership?'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {isRemove
            ? `${name} will lose access to this task.`
            : `${name} will become the owner. You will remain as an editor and can no longer manage members.`}
        </p>
        <div className="mt-6 flex gap-3">
          <OutlineButton className="flex-1" onClick={onCancel}>
            Cancel
          </OutlineButton>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-black text-white ${
              isRemove ? 'bg-red-500 hover:bg-red-600' : 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)] hover:brightness-95'
            }`}
          >
            {isRemove ? 'Remove' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}
