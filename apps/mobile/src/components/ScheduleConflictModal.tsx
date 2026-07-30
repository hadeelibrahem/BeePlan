import { Modal, Pressable, Text, View } from 'react-native';
import type { ScheduleConflict } from '../lib/plannerApi';
import { useTheme } from '../theme/useTheme';

export function ScheduleConflictModal({
  conflict,
  busy,
  onKeepCommitment,
  onKeepTask,
  onManual,
  onCancel,
}: {
  conflict: ScheduleConflict | null;
  busy?: boolean;
  onKeepCommitment: () => void;
  onKeepTask: () => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <Modal
      visible={Boolean(conflict)}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      {conflict ? (
        <View className="flex-1 justify-center bg-black/70 p-5">
          <View className="rounded-2xl border p-5" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
            <Text accessibilityRole="header" className="text-xl font-black" style={{ color: colors.text }}>Schedule Conflict</Text>
            <Text className="mt-2" style={{ color: colors.secondaryText }}>This task overlaps with your fixed commitment.</Text>
            <ConflictRow label="Task" title={conflict.task.title} time={`${conflict.task.startTime}–${conflict.task.endTime}`} />
            <ConflictRow label="Commitment" title={conflict.commitment.title} time={`${conflict.commitment.startTime}–${conflict.commitment.endTime}`} />
            <Text className="mt-3 font-bold" style={{ color: colors.error }}>Conflict duration: {conflict.conflictMinutes} minutes</Text>
            <View className="mt-3 rounded-xl border p-3" style={{ borderColor: colors.border }}>
              <Text className="text-xs font-black" style={{ color: colors.secondaryText }}>Old Schedule ↓ New Schedule</Text>
              <Text className="mt-1 font-bold" style={{ color: colors.warning }}>{conflict.task.startTime}–{conflict.task.endTime}</Text>
            </View>
            <Action label="Keep Commitment (Recommended)" onPress={onKeepCommitment} disabled={busy} primary />
            <Action label="Keep Task" onPress={onKeepTask} disabled={busy} />
            <Action label="Reschedule Manually" onPress={onManual} disabled={busy} />
            <Action label="Cancel" onPress={onCancel} disabled={busy} />
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

function ConflictRow({ label, title, time }: { label: string; title: string; time: string }) {
  const { theme } = useTheme();
  return <View className="mt-3"><Text className="text-xs font-black uppercase" style={{ color: theme.colors.secondaryText }}>{label}</Text><Text className="font-black" style={{ color: theme.colors.text }}>{title}</Text><Text style={{ color: theme.colors.secondaryText }}>{time}</Text></View>;
}

function Action({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} className="mt-2 rounded-xl border px-4 py-3" style={{ borderColor: theme.colors.border, backgroundColor: primary ? theme.colors.accent : theme.colors.surface }}><Text className="text-center font-black" style={{ color: primary ? theme.colors.accentText : theme.colors.text }}>{label}</Text></Pressable>;
}
