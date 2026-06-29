import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { Reminder } from '../types/reminders.types';
import { getLocationLabel } from '../utils/locationLabel';

const TYPE_META = {
  time: { icon: 'T' },
  location: { icon: 'L' },
  context: { icon: 'C' },
  checklist: { icon: 'K' },
};

const priorityDot: Record<Reminder['priority'], string> = {
  low: '#94A3B8',
  medium: '#fdef4b',
  high: '#FB923C',
  urgent: '#FB7185',
};

type Props = {
  reminder: Reminder;
  onPress?: () => void;
  onToggle?: () => void;
};

export function ReminderCard({ reminder, onPress, onToggle }: Props) {
  const { theme } = useTheme();
  const { formatPercent, t } = useLanguage();
  const styles = useMemo(() => createStyles(theme, reminder.type), [theme, reminder.type]);
  const statusBadge = getStatusBadge(theme);
  const meta = TYPE_META[reminder.type];
  const completed = reminder.status === 'done';
  const subtitle = getSubtitle(reminder);
  const progress =
    reminder.type === 'checklist' && reminder.checklistItems?.length
      ? reminder.checklistItems.filter((item) => item.isDone).length / reminder.checklistItems.length
      : null;

  return (
    <View
      className={`overflow-hidden rounded-2xl ${completed ? 'opacity-60' : ''}`}
      style={[
        styles.card,
        {
          elevation: theme.cardShadow.elevation,
          shadowColor: theme.cardShadow.color,
          shadowOffset: { height: 8, width: 0 },
          shadowOpacity: theme.cardShadow.opacity,
          shadowRadius: theme.cardShadow.radius,
        },
      ]}
    >
      <View className="absolute bottom-4 top-4 w-[3px] rounded-full" style={styles.leftAccent} />
      <View className="flex-row items-start gap-3 px-4 py-4">
        {onToggle && (
          <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={completed ? t('actions.markActive') : t('actions.markComplete')}
            className="mt-1 h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={completed ? styles.toggleDone : styles.toggle}
          >
            {completed && <View className="h-2.5 w-2.5 rounded-full" style={styles.toggleDot} />}
          </Pressable>
        )}

        <Pressable onPress={onPress} className="min-w-0 flex-1 flex-row items-start gap-3.5">
          <View
            className="mt-0.5 h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={styles.categoryAvatar}
          >
            <Text style={styles.categoryAvatarText} className="text-xs font-black">
              {meta.icon}
            </Text>
          </View>

          <View className="min-w-0 flex-1">
            <View className="mb-0.5 flex-row items-start gap-2">
              <Text
                className={`flex-1 text-sm font-semibold leading-snug ${
                  completed ? 'line-through' : ''
                }`}
                style={styles.title}
              >
                {reminder.title}
              </Text>
              <View
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: priorityDot[reminder.priority] }}
              />
            </View>

            {!!subtitle && <Text className="text-xs leading-snug" style={styles.subtle}>{subtitle}</Text>}

            {progress !== null && (
              <View className="mt-2.5 flex-row items-center gap-2">
                <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={styles.progressTrack}>
                  <View
                    className="h-full rounded-full"
                    style={[styles.progressBar, { width: `${progress * 100}%` }]}
                  />
                </View>
                <Text className="text-[11px] font-medium" style={styles.subtle}>
                  {formatPercent(Math.round(progress * 100))}
                </Text>
              </View>
            )}

            <View className="mt-2 flex-row items-center gap-2">
              <Text
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={statusBadge[reminder.status]}
              >
                {t(`status.${reminder.status}`)}
              </Text>
            </View>
          </View>

          <Text className="mt-1 shrink-0 text-lg" style={styles.subtle}>{'>'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getStatusBadge(
  theme: AppTheme,
): Record<Reminder['status'], { backgroundColor: string; color: string; label: string }> {
  return {
    active: {
      backgroundColor: 'rgba(34, 197, 94, 0.14)',
      color: theme.mode === 'dark' ? '#BBF7D0' : '#166534',
      label: 'active',
    },
    done: { backgroundColor: theme.colors.disabled, color: theme.colors.textSubtle, label: 'completed' },
    missed: {
      backgroundColor: 'rgba(239, 68, 68, 0.14)',
      color: theme.mode === 'dark' ? '#FECACA' : '#991B1B',
      label: 'missed',
    },
    snoozed: { backgroundColor: theme.colors.accentSoft, color: theme.colors.accentText, label: 'snoozed' },
  };
}

function createStyles(theme: AppTheme, type: Reminder['type']) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.cardBorder,
      borderWidth: 1,
    },
    leftAccent: {
      backgroundColor: theme.colors.accent,
      opacity: 0.7,
      start: 0,
    },
    toggle: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    toggleDone: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
      borderWidth: 1,
    },
    toggleDot: {
      backgroundColor: theme.colors.accentText,
    },
    title: {
      color: theme.colors.text,
      fontWeight: '600',
    },
    subtle: {
      color: theme.colors.textSubtle,
    },
    progressTrack: {
      backgroundColor: theme.colors.progressTrack,
    },
    progressBar: {
      backgroundColor: theme.colors.accent,
    },
    categoryAvatar: {
      backgroundColor: theme.categoryAvatars[type].backgroundColor,
    },
    categoryAvatarText: {
      color: theme.categoryAvatars[type].color,
    },
  });
}

function getSubtitle(reminder: Reminder) {
  if (reminder.type === 'time' && reminder.remindAt) return reminder.remindAt;
  if (reminder.type === 'location' && reminder.location) {
    return `${reminder.location.triggerType === 'arrive' ? 'Arriving at' : 'Leaving'} ${getLocationLabel(reminder.location)}`;
  }
  if (reminder.type === 'checklist' && reminder.checklistItems) {
    const done = reminder.checklistItems.filter((item) => item.isDone).length;
    return `${done}/${reminder.checklistItems.length} items completed`;
  }
  if (reminder.type === 'context' && reminder.context) return reminder.context.condition;
  return '';
}
