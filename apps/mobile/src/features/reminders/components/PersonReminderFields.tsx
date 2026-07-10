import { Pressable, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { FriendSummary } from '../../social/types/social.types';
import type { PersonPermissionStatus, PersonReminderConfig } from '../types/reminders.types';

const RADIUS_OPTIONS = [20, 100, 500, 1000];

const PERMISSION_LABEL_KEYS: Record<PersonPermissionStatus, string> = {
  pending: 'reminders.person.status.pending',
  active: 'reminders.person.status.active',
  expired: 'reminders.person.status.expired',
  revoked: 'reminders.person.status.revoked',
  rejected: 'reminders.person.status.rejected',
};

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

type Props = {
  value: PersonReminderConfig;
  onChange: (next: PersonReminderConfig) => void;
  friends: FriendSummary[];
  onAddFriend?: () => void;
};

/**
 * Person ("when they're nearby") reminder fields. Shared across manual creation,
 * AI text/voice prefill, and editing. Title + notes come from the parent
 * ReminderForm; this owns the person-specific config and the friend-match UI.
 */
export function PersonReminderFields({ value, onChange, friends, onAddFriend }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  const radius = value.radiusMeters ?? 100;
  const selectedFriend =
    friends.find((f) => f.userId === value.targetUserId) ??
    value.candidates?.find((f) => f.userId === value.targetUserId) ??
    null;

  const usedAi = typeof value.confidence === 'number';
  const unmatched =
    usedAi && !selectedFriend && (value.matchStatus === 'no_match' || value.matchStatus === 'needs_selection');

  const chooseFriend = (userId: string) => onChange({ ...value, targetUserId: userId, matchStatus: 'matched' });

  const chip = (selected: boolean) => ({
    borderColor: selected ? colors.accent : colors.border,
    backgroundColor: selected ? colors.accentSoft : colors.input,
  });

  const label = (key: string) => (
    <Text className="mb-1.5 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
      {t(key)}
    </Text>
  );

  return (
    <View className="gap-4">
      {/* AI confidence — only when the AI populated this reminder. */}
      {usedAi && (
        <View className="rounded-xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.person.confidence')}
            </Text>
            <Text className="text-xs font-black" style={{ color: colors.accent }}>
              {Math.round((value.confidence ?? 0) * 100)}%
            </Text>
          </View>
          <View className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.border }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${Math.round((value.confidence ?? 0) * 100)}%`, backgroundColor: colors.accent }}
            />
          </View>
        </View>
      )}

      {/* Friend selector */}
      <View>
        {label('reminders.person.friend')}
        {friends.length === 0 ? (
          <View className="rounded-xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text className="text-sm" style={{ color: colors.secondaryText }}>{t('reminders.person.noFriends')}</Text>
            {onAddFriend && (
              <Pressable onPress={onAddFriend} className="mt-2 self-start rounded-lg px-3 py-1.5 active:opacity-80" style={{ backgroundColor: colors.accent }}>
                <Text className="text-xs font-black" style={{ color: colors.accentText }}>{t('reminders.person.addFriend')}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {friends.map((f) => {
              const selected = value.targetUserId === f.userId;
              return (
                <Pressable key={f.userId} onPress={() => chooseFriend(f.userId)} className="rounded-full border px-3 py-2 active:opacity-80" style={chip(selected)}>
                  <Text className="text-xs font-bold" style={{ color: selected ? colors.accent : colors.text }}>{f.fullName}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Unmatched-person state */}
      {unmatched && (
        <View className="rounded-xl border p-3" style={{ borderColor: colors.warning, backgroundColor: colors.accentSoft }}>
          <Text className="mb-2 text-xs font-bold" style={{ color: colors.warning }}>
            {value.matchStatus === 'no_match'
              ? t('reminders.person.noMatch', { name: value.aiPersonName || t('reminders.person.thatPerson') })
              : t('reminders.person.whichPerson', { name: value.aiPersonName || t('reminders.person.thatPerson') })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(value.candidates && value.candidates.length > 0 ? value.candidates : friends).map((f) => (
              <Pressable key={f.userId} onPress={() => chooseFriend(f.userId)} className="rounded-full border px-3 py-2 active:opacity-80" style={chip(false)}>
                <Text className="text-xs font-bold" style={{ color: colors.text }}>{f.fullName}</Text>
              </Pressable>
            ))}
            {onAddFriend && (
              <Pressable onPress={onAddFriend} className="rounded-full px-3 py-2 active:opacity-80" style={{ backgroundColor: colors.accent }}>
                <Text className="text-xs font-black" style={{ color: colors.accentText }}>{t('reminders.person.addFriend')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Trigger — proximity only for now. */}
      <View>
        {label('reminders.person.trigger')}
        <View className="rounded-xl border px-3 py-2.5" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text className="text-sm" style={{ color: colors.text }}>
            {selectedFriend
              ? t('reminders.person.triggerNearbyNamed', { name: firstName(selectedFriend.fullName) })
              : t('reminders.person.triggerNearby')}
          </Text>
        </View>
      </View>

      {/* Radius */}
      <View>
        {label('reminders.person.radius')}
        <View className="flex-row flex-wrap gap-2">
          {RADIUS_OPTIONS.map((r) => {
            const selected = radius === r;
            return (
              <Pressable key={r} onPress={() => onChange({ ...value, radiusMeters: r })} className="rounded-full border px-3 py-2 active:opacity-80" style={chip(selected)}>
                <Text className="text-xs font-bold" style={{ color: selected ? colors.accent : colors.text }}>{`${r} ${t('reminders.person.meters')}`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Permission status */}
      <View>
        {label('reminders.person.permission')}
        {value.permissionStatus ? (
          <Text className="text-sm font-semibold" style={{ color: colors.text }}>
            {t(PERMISSION_LABEL_KEYS[value.permissionStatus])}
          </Text>
        ) : (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>
            {selectedFriend
              ? t('reminders.person.willRequest', { name: firstName(selectedFriend.fullName) })
              : t('reminders.person.selectToContinue')}
          </Text>
        )}
        <Text className="mt-2 text-[11px]" style={{ color: colors.secondaryText }}>{t('reminders.person.proximityNote')}</Text>
      </View>
    </View>
  );
}
