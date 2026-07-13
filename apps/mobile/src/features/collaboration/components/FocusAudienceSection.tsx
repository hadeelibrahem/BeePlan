import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useTheme } from '../../../theme/useTheme';
import { getPreferences, updatePreferences } from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';

type Props = {
  taskId: string;
  canEditShared: boolean;
  focusEnabled: boolean;
  onFocusEnabledChange: (value: boolean) => void;
  onError: (message: string) => void;
};

/**
 * Shared-vs-personal focus audience picker for the Edit Task screen. Shared
 * focus flips the task's own `isFocusTask` flag (saved with the rest of the
 * task on "Save Changes") so it appears in everyone's Focus Queue. Personal
 * focus is a private, immediately-persisted preference that only affects
 * the current user's own Focus Queue.
 */
export function FocusAudienceSection({
  taskId,
  canEditShared,
  focusEnabled,
  onFocusEnabledChange,
  onError,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [tab, setTab] = useState<'shared' | 'personal'>(canEditShared ? 'shared' : 'personal');
  const [personalFocus, setPersonalFocus] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getPreferences(taskId)
      .then((prefs) => {
        if (!active) return;
        setPersonalFocus(prefs.isFocusQueued);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [taskId]);

  async function togglePersonalFocus(next: boolean) {
    setPersonalFocus(next); // optimistic
    try {
      await updatePreferences(taskId, { isFocusQueued: next });
    } catch (err) {
      setPersonalFocus(!next); // rollback
      onError(friendlyError(err, 'Could not update your personal focus setting.'));
    }
  }

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text style={{ color: colors.text }} className="text-xs font-black">
          🎯 Focus Audience
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

      {tab === 'shared' ? (
        <>
          <Text style={{ color: colors.secondaryText }} className="mb-2 text-[11px]">
            A shared focus task appears in the Focus Queue for every member of this task.
          </Text>
          <View className="flex-row items-center justify-between">
            <Text style={{ color: colors.text }} className="text-sm font-bold">
              Enable shared focus
            </Text>
            <Switch value={focusEnabled} onValueChange={onFocusEnabledChange} />
          </View>
        </>
      ) : (
        <>
          <Text style={{ color: colors.secondaryText }} className="mb-2 text-[11px]">
            A personal focus task appears only in your own Focus Queue.
          </Text>
          <View className="flex-row items-center justify-between">
            <Text style={{ color: colors.text }} className="text-sm font-bold">
              Enable personal focus
            </Text>
            <Switch disabled={!loaded} value={personalFocus} onValueChange={(value) => void togglePersonalFocus(value)} />
          </View>
        </>
      )}
    </View>
  );
}
