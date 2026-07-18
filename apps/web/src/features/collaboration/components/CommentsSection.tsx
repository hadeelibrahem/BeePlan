import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FriendAvatar } from '../../social/components/FriendAvatar'
import { GhostButton, PrimaryButton } from '../../../components/layout/Buttons'
import { ConfirmDestructiveModal } from '../../../components/ConfirmDestructiveModal'
import {
  createComment,
  deleteComment,
  getComments,
  updateComment,
} from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'
import type { TaskComment, TaskMember } from '../types'

type Props = {
  taskId: string
  accessToken: string
  members: TaskMember[]
  currentUserId: string
  onError: (message: string) => void
}

const PAGE_SIZE = 20

export function CommentsSection({ taskId, accessToken, members, currentUserId, onError }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(
    async (targetPage: number) => {
      setLoadFailed(false)
      if (targetPage === 1) setLoading(true)
      try {
        const result = await getComments(taskId, accessToken, targetPage, PAGE_SIZE)
        setComments((prev) =>
          targetPage === 1 ? result.items : [...prev, ...result.items],
        )
        setHasMore(result.hasMore)
        setPage(targetPage)
      } catch {
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    },
    [taskId, accessToken],
  )

  useEffect(() => {
    void load(1)
  }, [load])

  // --- Optimistic create ---------------------------------------------------
  const handleCreate = useCallback(
    async (message: string, mentionedUserIds: string[]) => {
      const tempId = `temp-${Date.now()}`
      const optimistic: TaskComment = {
        id: tempId,
        taskId,
        message,
        author: {
          id: currentUserId,
          fullName: members.find((m) => m.userId === currentUserId)?.user.fullName ?? 'You',
          avatarUrl: members.find((m) => m.userId === currentUserId)?.user.avatarUrl,
        },
        mentionedUserIds,
        isEdited: false,
        createdAt: new Date().toISOString(),
      }
      setComments((prev) => [optimistic, ...prev])
      try {
        const saved = await createComment(taskId, message, mentionedUserIds, accessToken)
        setComments((prev) => prev.map((c) => (c.id === tempId ? saved : c)))
      } catch (err) {
        setComments((prev) => prev.filter((c) => c.id !== tempId)) // rollback
        onError(friendlyError(err, 'Could not post your comment.'))
      }
    },
    [taskId, accessToken, currentUserId, members, onError],
  )

  const handleEdit = useCallback(
    async (comment: TaskComment, message: string, mentionedUserIds: string[]) => {
      const previous = comment
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, message, isEdited: true } : c)),
      )
      setEditingId(null)
      try {
        const saved = await updateComment(comment.id, message, mentionedUserIds, accessToken)
        setComments((prev) => prev.map((c) => (c.id === comment.id ? saved : c)))
      } catch (err) {
        setComments((prev) => prev.map((c) => (c.id === comment.id ? previous : c))) // rollback
        onError(friendlyError(err, 'Could not update your comment.'))
      }
    },
    [accessToken, onError],
  )

  const handleDelete = useCallback(
    async (comment: TaskComment) => {
      const snapshot = comments
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      try {
        await deleteComment(comment.id, accessToken)
      } catch (err) {
        setComments(snapshot) // rollback
        onError(friendlyError(err, 'Could not delete your comment.'))
      }
    },
    [comments, accessToken, onError],
  )
  const [commentToDelete, setCommentToDelete] = useState<TaskComment | null>(null)
  const [isDeletingComment, setIsDeletingComment] = useState(false)
  const deletingCommentRef = useRef(false)

  async function confirmDeleteComment() {
    if (!commentToDelete || deletingCommentRef.current) return
    deletingCommentRef.current = true
    setIsDeletingComment(true)
    try {
      await handleDelete(commentToDelete)
    } finally {
      deletingCommentRef.current = false
      setIsDeletingComment(false)
      setCommentToDelete(null)
    }
  }

  return (
    <section
      className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
      aria-label="Comments"
    >
      <h3 className="mb-3 text-sm font-black">Comments</h3>

      <CommentComposer members={members} onSubmit={handleCreate} />

      {loading ? (
        <div className="mt-4 space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bp-border)]/40" />
          ))}
        </div>
      ) : loadFailed ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-center">
          <p className="text-xs font-semibold text-red-300">Couldn’t load comments.</p>
          <GhostButton size="sm" className="mt-2" onClick={() => void load(1)}>
            Retry
          </GhostButton>
        </div>
      ) : comments.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              members={members}
              isOwn={comment.author?.id === currentUserId}
              isEditing={editingId === comment.id}
              onStartEdit={() => setEditingId(comment.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(msg, mentions) => void handleEdit(comment, msg, mentions)}
              onDelete={() => setCommentToDelete(comment)}
            />
          ))}
          {hasMore ? (
            <GhostButton size="sm" className="w-full" onClick={() => void load(page + 1)}>
              Load older comments
            </GhostButton>
          ) : null}
        </ul>
      )}
      <ConfirmDestructiveModal open={commentToDelete !== null} title="Delete comment?" message="This action cannot be undone." confirmLabel="Delete comment" isConfirming={isDeletingComment} onCancel={() => !isDeletingComment && setCommentToDelete(null)} onConfirm={() => void confirmDeleteComment()} />
    </section>
  )
}

// --- Composer with @mention autocomplete -----------------------------------

function CommentComposer({
  members,
  initial = '',
  onSubmit,
  onCancel,
  compact,
}: {
  members: TaskMember[]
  initial?: string
  onSubmit: (message: string, mentionedUserIds: string[]) => void | Promise<void>
  onCancel?: () => void
  compact?: boolean
}) {
  const [text, setText] = useState(initial)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => m.status === 'accepted')
      .filter((m) => !q || m.user.fullName.toLowerCase().includes(q))
      .slice(0, 5)
  }, [mentionQuery, members])

  function handleChange(value: string) {
    setText(value)
    const caret = textareaRef.current?.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const match = /(?:^|\s)@([\p{L}\p{N}]*)$/u.exec(before)
    setMentionQuery(match ? match[1] : null)
  }

  function insertMention(member: TaskMember) {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? text.length
    const before = text.slice(0, caret).replace(/(?:^|\s)@([\p{L}\p{N}]*)$/u, (m) =>
      m.startsWith('@') ? `@${member.user.fullName} ` : `${m[0]}@${member.user.fullName} `,
    )
    const after = text.slice(caret)
    setText(before + after)
    setMentionQuery(null)
    requestAnimationFrame(() => el?.focus())
  }

  // Resolve mentioned ids by scanning for "@FullName" tokens.
  function resolveMentions(message: string): string[] {
    const ids = new Set<string>()
    for (const member of members) {
      if (message.includes(`@${member.user.fullName}`)) ids.add(member.userId)
    }
    return [...ids]
  }

  async function submit() {
    const message = text.trim()
    if (!message || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(message, resolveMentions(message))
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
        }}
        rows={compact ? 2 : 3}
        placeholder="Write a comment… use @ to mention a member"
        aria-label="Write a comment"
        className="w-full resize-none rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]/60"
      />

      {mentionCandidates.length ? (
        <ul
          role="listbox"
          aria-label="Mention a member"
          className="absolute left-2 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] py-1 shadow-2xl"
        >
          {mentionCandidates.map((member) => (
            <li key={member.userId}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => insertMention(member)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bp-border)]/50"
              >
                <FriendAvatar fullName={member.user.fullName} avatarUrl={member.user.avatarUrl} size={26} />
                <span className="truncate text-xs font-semibold text-[var(--bp-text)]">
                  {member.user.fullName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        {onCancel ? (
          <GhostButton size="sm" onClick={onCancel}>
            Cancel
          </GhostButton>
        ) : null}
        <PrimaryButton size="sm" loading={submitting} disabled={!text.trim()} onClick={() => void submit()}>
          {onCancel ? 'Save' : 'Comment'}
        </PrimaryButton>
      </div>
    </div>
  )
}

// --- Single comment --------------------------------------------------------

function CommentItem({
  comment,
  members,
  isOwn,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  comment: TaskComment
  members: TaskMember[]
  isOwn: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (message: string, mentionedUserIds: string[]) => void
  onDelete: () => void
}) {
  const isPending = comment.id.startsWith('temp-')
  return (
    <li className={`flex gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <FriendAvatar
        fullName={comment.author?.fullName ?? '?'}
        avatarUrl={comment.author?.avatarUrl}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--bp-text)]">
            {comment.author?.fullName ?? 'Unknown'}
          </span>
          <span className="text-[10px] text-slate-500">{formatTime(comment.createdAt)}</span>
          {comment.isEdited ? <span className="text-[10px] text-slate-500">(edited)</span> : null}
        </div>

        {isEditing ? (
          <div className="mt-1.5">
            <CommentComposer
              members={members}
              initial={comment.message}
              compact
              onCancel={onCancelEdit}
              onSubmit={(message, mentions) => onSaveEdit(message, mentions)}
            />
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
            {renderWithMentions(comment.message)}
          </p>
        )}

        {isOwn && !isEditing && !isPending ? (
          <div className="mt-1 flex gap-3 text-[11px] font-semibold text-slate-500">
            <button type="button" className="hover:text-[var(--bp-accent)]" onClick={onStartEdit}>
              Edit
            </button>
            <button type="button" className="hover:text-red-400" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function renderWithMentions(message: string) {
  // Bold @Name tokens for readability without needing a rich editor.
  const parts = message.split(/(@[\p{L}\p{N}]+(?:\s[\p{L}\p{N}]+)?)/u)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="font-bold text-[var(--bp-accent)]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
