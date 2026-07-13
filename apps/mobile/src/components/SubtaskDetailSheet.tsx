import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import {
  deleteSubtaskAttachment,
  getSubtaskAttachments,
  openAttachment,
  updateSubtask,
  uploadSubtaskAttachment,
  type ApiSubtask,
  type ApiSubtaskStatus,
  type ApiTask,
  type ApiTaskAttachment,
} from '../lib/tasksApi';
import {
  displaySubtaskTitle,
  formatDuration,
  getSubtaskWarnings,
  SUBTASK_PRIORITY_COLOR,
  SUBTASK_PRIORITY_LABEL,
  SUBTASK_STATUS_LABEL,
} from '../lib/subtasks';
import * as DocumentPicker from 'expo-document-picker';

const STATUS_ORDER: ApiSubtaskStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'missed'];

type Props = {
  visible: boolean;
  task: ApiTask;
  subtask: ApiSubtask | null;
  accessToken: string;
  canEdit?: boolean;
  onClose: () => void;
  onEdit: (subtask: ApiSubtask) => void;
  onTaskUpdated: (task: ApiTask) => void;
};

export default function SubtaskDetailSheet({
  visible,
  task,
  subtask,
  accessToken,
  canEdit = true,
  onClose,
  onEdit,
  onTaskUpdated,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [attachments, setAttachments] = useState<ApiTaskAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !subtask) return;
    let active = true;
    getSubtaskAttachments(accessToken, task.id, subtask.id)
      .then((rows) => active && setAttachments(rows))
      .catch(() => active && setAttachments([]));
    return () => {
      active = false;
    };
  }, [visible, accessToken, task.id, subtask]);

  if (!subtask) return null;

  const warnings = getSubtaskWarnings(subtask, {
    parentDueDate: task.dueDate,
    remainingParentMinutes: task.remainingTimeMinutes,
  });
  const depNames = subtask.dependencyIds
    .map((id) => task.subtasks.find((s) => s.id === id)?.title)
    .filter(Boolean) as string[];

  async function changeStatus(status: ApiSubtaskStatus) {
    if (!subtask || status === subtask.status) return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateSubtask(accessToken, task.id, subtask.id, {
        status,
        isDone: status === 'done',
      });
      onTaskUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAttachment() {
    if (!subtask) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setBusy(true);
    setError('');
    try {
      const created = await uploadSubtaskAttachment(accessToken, task.id, subtask.id, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType,
      });
      setAttachments((current) => [...current, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAttachment(attachmentId: string) {
    if (!subtask) return;
    setBusy(true);
    try {
      await deleteSubtaskAttachment(accessToken, task.id, subtask.id, attachmentId);
      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove attachment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close subtask sheet" />

        <View
          className="rounded-t-[28px] border px-5 pt-3"
          style={{
            maxHeight: '90%',
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View className="mx-auto mb-4 h-1.5 w-14 rounded-full" style={{ backgroundColor: colors.border }} />

          <View className="mb-4 flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-xl font-black" style={{ color: colors.text }}>
              {displaySubtaskTitle(subtask)}
            </Text>
            {canEdit ? (
              <Pressable
                onPress={() => onEdit(subtask)}
                className="rounded-xl border px-3 py-1.5"
                style={{ borderColor: colors.border }}
              >
                <Text className="text-xs font-bold" style={{ color: colors.text }}>Edit</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {error ? (
              <Text className="mb-3 rounded-xl px-3 py-2 text-xs font-bold" style={{ backgroundColor: `${colors.error}18`, color: colors.error }}>
                {error}
              </Text>
            ) : null}

            {warnings.map((w) => (
              <Text key={w} className="mb-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ backgroundColor: `${colors.accent}18`, color: colors.accent }}>
                ⚠ {w}
              </Text>
            ))}

            {/* Status quick-switch */}
            <View className="mb-4 flex-row flex-wrap gap-2">
              {STATUS_ORDER.map((status) => {
                const active = subtask.status === status;
                return (
                  <Pressable
                    key={status}
                    disabled={busy || !canEdit}
                    onPress={() => void changeStatus(status)}
                    className="rounded-full px-3 py-1.5"
                    style={{ backgroundColor: active ? colors.primary : colors.background }}
                  >
                    <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.secondaryText }}>
                      {SUBTASK_STATUS_LABEL[status]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {subtask.description ? <DetailField label="Description" value={subtask.description} colors={colors} /> : null}

            <View className="flex-row flex-wrap">
              <HalfField label="Priority" colors={colors}>
                <Text className="text-sm font-bold" style={{ color: SUBTASK_PRIORITY_COLOR[subtask.priority] }}>
                  {SUBTASK_PRIORITY_LABEL[subtask.priority]}
                </Text>
              </HalfField>
              <HalfField label="Status" colors={colors}>
                <Text className="text-sm font-bold" style={{ color: colors.text }}>{SUBTASK_STATUS_LABEL[subtask.status]}</Text>
              </HalfField>
              <HalfField label="Start Date" colors={colors}>
                <Text className="text-sm" style={{ color: colors.text }}>{formatDateTime(subtask.startDate)}</Text>
              </HalfField>
              <HalfField label="Due Date" colors={colors}>
                <Text className="text-sm" style={{ color: colors.text }}>{formatDateTime(subtask.dueDate)}</Text>
              </HalfField>
              <HalfField label="Estimated" colors={colors}>
                <Text className="text-sm" style={{ color: colors.text }}>
                  {formatDuration(subtask.estimatedDurationMinutes) || '—'}
                  {subtask.estimatedDurationSource === 'ai' && subtask.estimatedDurationMinutes ? '  (AI)' : ''}
                </Text>
              </HalfField>
              <HalfField label="Actual" colors={colors}>
                <Text className="text-sm" style={{ color: colors.text }}>{formatDuration(subtask.actualDurationMinutes) || '—'}</Text>
              </HalfField>
              <HalfField label="Reminder" colors={colors}>
                <Text className="text-sm" style={{ color: colors.text }}>
                  {subtask.reminderEnabled
                    ? subtask.reminderMinutesBeforeDue
                      ? `${subtask.reminderMinutesBeforeDue} min before`
                      : 'On'
                    : 'Off'}
                </Text>
              </HalfField>
              <HalfField label="Assignee" colors={colors}>
                <Text className="text-sm" style={{ color: colors.text }}>{subtask.assignee || '—'}</Text>
              </HalfField>
            </View>

            {depNames.length ? <DetailField label="Dependencies" value={depNames.join(', ')} colors={colors} /> : null}
            {subtask.tags.length ? <DetailField label="Tags" value={subtask.tags.map((t) => `#${t}`).join('  ')} colors={colors} /> : null}
            {subtask.notes ? <DetailField label="Notes" value={subtask.notes} colors={colors} /> : null}

            {/* Attachments */}
            <Text className="mb-2 mt-4 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>Attachments</Text>
            {attachments.map((a) => (
              <View key={a.id ?? a.name} className="mb-2 flex-row items-center gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
                <Text className="flex-1 text-sm" style={{ color: colors.text }} numberOfLines={1}>
                  {a.fileName ?? a.name}
                </Text>
                <Pressable onPress={() => void openAttachment(accessToken, task.id, a)}>
                  <Text className="text-xs font-bold" style={{ color: colors.primary }}>Open</Text>
                </Pressable>
                {canEdit ? (
                  <Pressable onPress={() => a.id && void handleRemoveAttachment(a.id)}>
                    <Text className="text-xs font-bold" style={{ color: colors.error }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {canEdit ? (
              <Pressable
                disabled={busy}
                onPress={() => void handleAddAttachment()}
                className="rounded-xl border border-dashed p-3"
                style={{ borderColor: colors.border }}
              >
                <Text className="text-center text-sm font-bold" style={{ color: colors.secondaryText }}>+ Add Attachment</Text>
              </Pressable>
            ) : null}

            {/* Activity */}
            <Text className="mb-2 mt-4 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>Activity</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>Created: {formatDateTime(subtask.createdAt)}</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>Last Updated: {formatDateTime(subtask.updatedAt)}</Text>
            {subtask.completedAt ? (
              <Text className="text-xs" style={{ color: colors.secondaryText }}>Completed: {formatDateTime(subtask.completedAt)}</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailField({ label, value, colors }: { label: string; value: string; colors: { secondaryText: string; text: string } }) {
  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="text-sm" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}

function HalfField({ label, children, colors }: { label: string; children: React.ReactNode; colors: { secondaryText: string } }) {
  return (
    <View className="mt-3 w-1/2 pr-2">
      <Text className="mb-1 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>{label}</Text>
      {children}
    </View>
  );
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
