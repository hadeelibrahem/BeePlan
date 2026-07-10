import { Pressable, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { Reminder } from '../types/reminders.types';
import { getLocationLabel } from '../utils/locationLabel';

const TYPE_ICON: Record<Reminder['type'], string> = {
  time: 'T',
  location: 'L',
  context: 'C',
  checklist: 'K',
  person: '👤',
};

const PERSON_PERMISSION_LABEL: Record<string, string> = {
  pending: 'Waiting for approval',
  active: 'Active',
  expired: 'Permission expired',
  revoked: 'Permission revoked',
  rejected: 'Request declined',
};

type Props = {
  reminder: Reminder;
  onPress?: () => void;
  onToggle?: () => void;
};

export function ReminderCard({ reminder, onPress, onToggle }: Props) {
  const { formatPercent, t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  // categoryAvatars doesn't include 'person'; give it a distinct sky-tinted
  // avatar and let the other types use the themed category colors.
  const PERSON_ACCENT = '#38bdf8';
  const meta =
    reminder.type === 'person'
      ? { backgroundColor: 'rgba(56, 189, 248, 0.14)', color: PERSON_ACCENT }
      : theme.categoryAvatars[reminder.type];
  const completed = reminder.status === 'done';
  const subtitle = getSubtitle(reminder);
  const progress =
    reminder.type === 'checklist' && reminder.checklistItems?.length
      ? reminder.checklistItems.filter((item) => item.isDone).length / reminder.checklistItems.length
      : null;

  const statusBadge =
    reminder.status === 'active'
      ? { bg: `${colors.success}26`, color: colors.success }
      : reminder.status === 'missed'
        ? { bg: `${colors.error}26`, color: colors.error }
        : reminder.status === 'snoozed'
          ? { bg: colors.accentSoft, color: colors.accent }
          : { bg: colors.disabled, color: colors.secondaryText };

  const priorityDot: Record<Reminder['priority'], string> = {
    low: colors.secondaryText,
    medium: colors.accent,
    high: colors.warning,
    urgent: colors.error,
  };

  return (
    <View
      className={`overflow-hidden rounded-2xl border ${completed ? 'opacity-60' : ''}`}
      style={{
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        shadowColor: theme.cardShadow.color,
        shadowOffset: { height: 6, width: 0 },
        shadowOpacity: theme.cardShadow.opacity,
        shadowRadius: theme.cardShadow.radius,
        elevation: theme.cardShadow.elevation,
      }}
    >
      <View className="absolute bottom-4 top-4 w-[3px] rounded-full" style={{ backgroundColor: colors.accent, opacity: 0.7 }} />
      <View className="flex-row items-start gap-3 px-3 py-3">
        {onToggle && (
          <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={completed ? t('actions.markActive') : t('actions.markComplete')}
            className="mt-1 h-6 w-6 shrink-0 items-center justify-center rounded-full border"
            style={{
              borderColor: completed ? colors.accent : colors.border,
              backgroundColor: completed ? colors.accent : colors.surfaceElevated,
            }}
          >
            {completed && <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.accentText }} />}
          </Pressable>
        )}

        <Pressable onPress={onPress} className="min-w-0 flex-1 flex-row items-start gap-3.5">
          <View className="mt-0.5 h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: meta.backgroundColor }}>
            <Text className="text-xs font-black" style={{ color: meta.color }}>
              {TYPE_ICON[reminder.type]}
            </Text>
          </View>

          <View className="min-w-0 flex-1">
            <View className="mb-0.5 flex-row items-start gap-2">
              <Text
                className={`flex-1 text-sm font-semibold leading-snug ${completed ? 'line-through' : ''}`}
                style={{ color: colors.text }}
              >
                {reminder.title}
              </Text>
              <View className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priorityDot[reminder.priority] }} />
            </View>

            {!!subtitle && <Text className="text-xs leading-snug" style={{ color: colors.secondaryText }}>{subtitle}</Text>}

            {progress !== null && (
              <View className="mt-2.5 flex-row items-center gap-2">
                <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
                  <View className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: colors.accent }} />
                </View>
                <Text className="text-[11px] font-medium" style={{ color: colors.secondaryText }}>
                  {formatPercent(Math.round(progress * 100))}
                </Text>
              </View>
            )}

            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <Text
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: statusBadge.bg, color: statusBadge.color }}
              >
                {t(`status.${reminder.status}`)}
              </Text>
              {reminder.type === 'person' && reminder.person?.permissionStatus && (
                <Text
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: colors.surfaceElevated, color: colors.secondaryText }}
                >
                  {PERSON_PERMISSION_LABEL[reminder.person.permissionStatus] ?? reminder.person.permissionStatus}
                </Text>
              )}
            </View>

            {reminder.type === 'person' && reminder.person && (
              <Text className="mt-1.5 text-[11px]" style={{ color: colors.textSubtle }}>
                {`Radius ${reminder.person.radiusMeters ?? 100}m · ${
                  reminder.person.lastNotifiedAt
                    ? `Last alerted ${new Date(reminder.person.lastNotifiedAt).toLocaleString()}`
                    : 'Not alerted yet'
                }`}
              </Text>
            )}
          </View>

          <Text className="mt-1 shrink-0 text-lg" style={{ color: colors.secondaryText }}>{'>'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getSubtitle(reminder: Reminder) {
  if (reminder.type === 'time' && reminder.remindAt) return reminder.remindAt;
  if (reminder.type === 'location' && reminder.location) {
    return `${reminder.location.trigger === 'arrive' ? 'Arriving at' : 'Leaving'} ${getLocationLabel(reminder.location)}`;
  }
  if (reminder.type === 'checklist' && reminder.checklistItems) {
    const done = reminder.checklistItems.filter((item) => item.isDone).length;
    return `${done}/${reminder.checklistItems.length} items completed`;
  }
  if (reminder.type === 'context' && reminder.context) return reminder.context.condition;
  if (reminder.type === 'person' && reminder.person) {
    const name = reminder.person.targetFriendName ?? reminder.person.targetName ?? 'your friend';
    return `When ${name} is nearby`;
  }
  return '';
}
