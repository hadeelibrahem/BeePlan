import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SectionCard } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { Avatar } from './Avatar';
import { createComment, deleteComment, getComments, updateComment } from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';
import type { TaskComment, TaskMember } from '../types';

type Props = {
  taskId: string;
  members: TaskMember[];
  currentUserId: string;
  onError: (message: string) => void;
};

export function CommentsSection({ taskId, members, currentUserId, onError }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (target: number) => {
      setFailed(false);
      if (target === 1) setLoading(true);
      try {
        const res = await getComments(taskId, target, 20);
        setComments((prev) => (target === 1 ? res.items : [...prev, ...res.items]));
        setHasMore(res.hasMore);
        setPage(target);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [taskId],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const resolveMentions = useCallback(
    (message: string) =>
      members.filter((m) => message.includes(`@${m.user.fullName}`)).map((m) => m.userId),
    [members],
  );

  const mentionSuggestions = useMemo(() => {
    // Avoid \p{...} unicode property escapes — not supported on Hermes.
    const match = /(?:^|\s)@(\S*)$/.exec(draft);
    if (!match) return [];
    const q = match[1].toLowerCase();
    return members
      .filter((m) => m.status === 'accepted')
      .filter((m) => !q || m.user.fullName.toLowerCase().includes(q))
      .slice(0, 4);
  }, [draft, members]);

  async function submitNew() {
    const message = draft.trim();
    if (!message || submitting) return;
    setSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const me = members.find((m) => m.userId === currentUserId);
    const optimistic: TaskComment = {
      id: tempId,
      taskId,
      message,
      author: { id: currentUserId, fullName: me?.user.fullName ?? 'You', avatarUrl: me?.user.avatarUrl },
      mentionedUserIds: [],
      isEdited: false,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [optimistic, ...prev]);
    setDraft('');
    try {
      const saved = await createComment(taskId, message, resolveMentions(message));
      setComments((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      onError(friendlyError(err, 'Could not post your comment.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(comment: TaskComment) {
    const message = editDraft.trim();
    if (!message) return;
    const previous = comment;
    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, message, isEdited: true } : c)));
    setEditingId(null);
    try {
      const saved = await updateComment(comment.id, message, resolveMentions(message));
      setComments((prev) => prev.map((c) => (c.id === comment.id ? saved : c)));
    } catch (err) {
      setComments((prev) => prev.map((c) => (c.id === comment.id ? previous : c)));
      onError(friendlyError(err, 'Could not update your comment.'));
    }
  }

  function confirmDelete(comment: TaskComment) {
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const snapshot = comments;
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          try {
            await deleteComment(comment.id);
          } catch (err) {
            setComments(snapshot);
            onError(friendlyError(err, 'Could not delete your comment.'));
          }
        },
      },
    ]);
  }

  return (
    <SectionCard className="mb-3">
      <Text style={{ color: colors.text }} className="mb-3 text-sm font-black">
        Comments
      </Text>

      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Write a comment… use @ to mention"
        placeholderTextColor={colors.placeholder}
        multiline
        className="rounded-xl border px-3 py-2.5 text-sm"
        style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text, minHeight: 60 }}
      />
      {mentionSuggestions.length ? (
        <View className="mt-1.5 flex-row flex-wrap gap-1.5">
          {mentionSuggestions.map((m) => (
            <Pressable
              key={m.userId}
              onPress={() =>
                setDraft((d) => d.replace(/(?:^|\s)@(\S*)$/, (mm) => (mm.startsWith('@') ? `@${m.user.fullName} ` : `${mm[0]}@${m.user.fullName} `)))
              }
              className="rounded-full border px-2.5 py-1"
              style={{ borderColor: colors.border }}
            >
              <Text style={{ color: colors.accent }} className="text-xs font-semibold">
                @{m.user.fullName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="mt-2 flex-row justify-end">
        <Pressable
          onPress={() => void submitNew()}
          disabled={!draft.trim() || submitting}
          className="rounded-lg px-4 py-2"
          style={{ backgroundColor: colors.accent, opacity: !draft.trim() || submitting ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.accentText }} className="text-xs font-black">
            {submitting ? 'Posting…' : 'Comment'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} className="py-4" />
      ) : failed ? (
        <Pressable onPress={() => void load(1)} className="mt-3 items-center py-3">
          <Text style={{ color: colors.error }} className="text-xs font-semibold">
            Couldn’t load comments. Tap to retry.
          </Text>
        </Pressable>
      ) : comments.length === 0 ? (
        <Text style={{ color: colors.secondaryText }} className="mt-4 text-center text-sm">
          No comments yet. Start the conversation.
        </Text>
      ) : (
        <View className="mt-4 gap-3">
          {comments.map((comment) => {
            const isOwn = comment.author?.id === currentUserId;
            const isPending = comment.id.startsWith('temp-');
            const isEditing = editingId === comment.id;
            return (
              <View key={comment.id} className="flex-row gap-3" style={{ opacity: isPending ? 0.6 : 1 }}>
                <Avatar fullName={comment.author?.fullName ?? '?'} avatarUrl={comment.author?.avatarUrl} size={32} />
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text style={{ color: colors.text }} className="text-xs font-bold">
                      {comment.author?.fullName ?? 'Unknown'}
                    </Text>
                    <Text style={{ color: colors.textSubtle }} className="text-[10px]">
                      {formatTime(comment.createdAt)}
                      {comment.isEdited ? ' · edited' : ''}
                    </Text>
                  </View>
                  {isEditing ? (
                    <View className="mt-1">
                      <TextInput
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                        className="rounded-lg border px-2 py-1.5 text-sm"
                        style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                      />
                      <View className="mt-1 flex-row justify-end gap-3">
                        <Pressable onPress={() => setEditingId(null)}>
                          <Text style={{ color: colors.secondaryText }} className="text-xs font-semibold">
                            Cancel
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => void saveEdit(comment)}>
                          <Text style={{ color: colors.accent }} className="text-xs font-black">
                            Save
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: colors.secondaryText }} className="mt-0.5 text-sm leading-5">
                      {comment.message}
                    </Text>
                  )}
                  {isOwn && !isEditing && !isPending ? (
                    <View className="mt-1 flex-row gap-4">
                      <Pressable
                        onPress={() => {
                          setEditDraft(comment.message);
                          setEditingId(comment.id);
                        }}
                      >
                        <Text style={{ color: colors.textSubtle }} className="text-[11px] font-semibold">
                          Edit
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => confirmDelete(comment)}>
                        <Text style={{ color: colors.error }} className="text-[11px] font-semibold">
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
          {hasMore ? (
            <Pressable onPress={() => void load(page + 1)} className="items-center py-2">
              <Text style={{ color: colors.secondaryText }} className="text-xs font-semibold">
                Load older comments
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
