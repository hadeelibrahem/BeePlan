import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SectionCard } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import {
  createPersonalReminder,
  createSharedReminder,
  getPreferences,
  updatePreferences,
} from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';
import type { PersonalPreferences } from '../types';

type Props = {
  taskId: string;
  canEditShared: boolean;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
};

type ToggleKey = 'isFavorite' | 'isPinned' | 'isFocusQueued' | 'notificationsMuted';

const TOGGLES: { key: ToggleKey; icon: string; label: string }[] = [
  { key: 'isFavorite', icon: '⭐', label: 'Favorite' },
  { key: 'isPinned', icon: '📌', label: 'Pin' },
  { key: 'isFocusQueued', icon: '🎯', label: 'Focus Queue' },
  { key: 'notificationsMuted', icon: '🔕', label: 'Mute' },
];

export function PreferencesSection({ taskId, canEditShared, onError, onNotice }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [prefs, setPrefs] = useState<PersonalPreferences | null>(null);
  const [tab, setTab] = useState<'shared' | 'personal'>(canEditShared ? 'shared' : 'personal');
  const [minutes, setMinutes] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getPreferences(taskId)
      .then((p) => active && setPrefs(p))
      .catch(() => active && setPrefs(null));
    return () => {
      active = false;
    };
  }, [taskId]);

  async function toggle(key: ToggleKey) {
    if (!prefs) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    try {
      await updatePreferences(taskId, { [key]: next });
    } catch (err) {
      setPrefs((cur) => (cur ? { ...cur, [key]: !next } : cur));
      onError(friendlyError(err, 'Could not update your preference.'));
    }
  }

  async function createReminder() {
    const mins = Number(minutes);
    if (!minutes || Number.isNaN(mins) || submitting) return;
    setSubmitting(true);
    try {
      const input = { title: title.trim() || undefined, reminderBeforeMinutes: mins };
      if (tab === 'shared') await createSharedReminder(taskId, input);
      else await createPersonalReminder(taskId, input);
      setMinutes('');
      setTitle('');
      onNotice(
        tab === 'shared'
          ? 'Shared reminder set for everyone on this task.'
          : 'Personal reminder set — only you will be notified.',
      );
    } catch (err) {
      onError(friendlyError(err, 'Could not create the reminder.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard className="mb-3">
      <View className="mb-1 flex-row items-center gap-2">
        <Text style={{ color: colors.text }} className="text-sm font-black">
          My Preferences
        </Text>
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${colors.accent}1a` }}>
          <Text style={{ color: colors.accent }} className="text-[10px] font-bold">
            Private to you
          </Text>
        </View>
      </View>
      <Text style={{ color: colors.secondaryText }} className="mb-3 text-xs">
        These settings never change the shared task.
      </Text>

      <View className="flex-row flex-wrap gap-2">
        {TOGGLES.map((toggleDef) => {
          const active = Boolean(prefs?.[toggleDef.key]);
          return (
            <Pressable
              key={toggleDef.key}
              disabled={!prefs}
              onPress={() => void toggle(toggleDef.key)}
              className="flex-row items-center gap-1.5 rounded-xl border px-3 py-2"
              style={{
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? `${colors.accent}1a` : 'transparent',
                opacity: prefs ? 1 : 0.5,
              }}
            >
              <Text className="text-base">{toggleDef.icon}</Text>
              <Text style={{ color: active ? colors.text : colors.secondaryText }} className="text-xs font-bold">
                {toggleDef.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4 border-t pt-4" style={{ borderColor: colors.border }}>
        <View className="mb-2 flex-row items-center justify-between">
          <Text style={{ color: colors.text }} className="text-xs font-black">
            🔔 Reminder
          </Text>
          <View className="flex-row overflow-hidden rounded-lg border" style={{ borderColor: colors.border }}>
            {(['shared', 'personal'] as const).map((option) => {
              const disabled = option === 'shared' && !canEditShared;
              return (
                <Pressable
                  key={option}
                  disabled={disabled}
                  onPress={() => setTab(option)}
                  className="px-3 py-1"
                  style={{ backgroundColor: tab === option ? colors.accent : 'transparent', opacity: disabled ? 0.4 : 1 }}
                >
                  <Text
                    className="text-[11px] font-bold capitalize"
                    style={{ color: tab === option ? colors.accentText : colors.secondaryText }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Text style={{ color: colors.secondaryText }} className="mb-2 text-[11px]">
          {tab === 'shared'
            ? 'A shared reminder notifies every member.'
            : 'A personal reminder notifies only you.'}
        </Text>
        <View className="flex-row gap-2">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title (optional)"
            placeholderTextColor={colors.placeholder}
            className="flex-1 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
          />
          <TextInput
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
            placeholder="Min before"
            placeholderTextColor={colors.placeholder}
            className="w-24 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
          />
          <Pressable
            onPress={() => void createReminder()}
            disabled={!minutes || submitting}
            className="rounded-lg px-3 py-2"
            style={{ backgroundColor: colors.accent, opacity: !minutes || submitting ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.accentText }} className="text-xs font-black">
              Set
            </Text>
          </Pressable>
        </View>
      </View>
    </SectionCard>
  );
}
