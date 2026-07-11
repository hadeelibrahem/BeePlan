import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { getFriends } from '../../social/api/social.api';
import type { FriendSummary } from '../../social/types/social.types';
import { PrimaryButton } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { Avatar } from './Avatar';
import { inviteMember } from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';
import type { TaskMember, TaskRole } from '../types';

type Props = {
  visible: boolean;
  taskId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onInvited: (member: TaskMember, name: string) => void;
};

export function InviteMemberSheet({ visible, taskId, existingMemberIds, onClose, onInvited }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FriendSummary | null>(null);
  const [role, setRole] = useState<Exclude<TaskRole, 'owner'>>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFriends(null);
    setLoadError('');
    setSelected(null);
    setSearch('');
    setError('');
    getFriends()
      .then(setFriends)
      .catch((err) => setLoadError(friendlyError(err, 'Could not load your friends.')));
  }, [visible]);

  const existing = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);
  const results = useMemo(() => {
    if (!friends) return [];
    const q = search.trim().toLowerCase();
    return friends
      .filter((f) => !existing.has(f.userId))
      .filter((f) => !q || f.fullName.toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
  }, [friends, search, existing]);

  async function submit() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const member = await inviteMember(taskId, selected.userId, role);
      onInvited(member, selected.fullName);
    } catch (err) {
      setError(friendlyError(err, 'Could not send the invite.'));
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: '#00000099' }}>
        <View
          className="rounded-t-3xl p-5"
          style={{ backgroundColor: colors.surfaceElevated, maxHeight: '85%' }}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <Text style={{ color: colors.text }} className="text-lg font-black">
              Invite a friend
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close">
              <Text style={{ color: colors.secondaryText }} className="text-lg">
                ✕
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search friends by name or email"
            placeholderTextColor={colors.placeholder}
            className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
          />

          <ScrollView className="max-h-72">
            {loadError ? (
              <Text style={{ color: colors.error }} className="text-xs font-semibold">
                {loadError}
              </Text>
            ) : friends === null ? (
              <ActivityIndicator color={colors.accent} className="py-6" />
            ) : results.length === 0 ? (
              <Text style={{ color: colors.secondaryText }} className="py-6 text-center text-sm">
                {friends.length === 0 ? 'Add friends first to invite them.' : 'No matching friends.'}
              </Text>
            ) : (
              <View className="gap-1.5">
                {results.map((friend) => {
                  const isSelected = selected?.userId === friend.userId;
                  return (
                    <Pressable
                      key={friend.userId}
                      onPress={() => setSelected(friend)}
                      className="flex-row items-center gap-3 rounded-xl border px-3 py-2.5"
                      style={{
                        borderColor: isSelected ? colors.accent : colors.border,
                        backgroundColor: isSelected ? `${colors.accent}1a` : 'transparent',
                      }}
                    >
                      <Avatar fullName={friend.fullName} avatarUrl={friend.avatarUrl} size={38} />
                      <View className="flex-1">
                        <Text style={{ color: colors.text }} className="text-sm font-bold" numberOfLines={1}>
                          {friend.fullName}
                        </Text>
                        <Text style={{ color: colors.secondaryText }} className="text-xs" numberOfLines={1}>
                          {friend.email}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View className="mt-4 border-t pt-4" style={{ borderColor: colors.border }}>
            <View className="mb-3 flex-row items-center gap-2">
              <Text style={{ color: colors.secondaryText }} className="text-xs font-semibold">
                Role
              </Text>
              <View className="flex-row overflow-hidden rounded-lg border" style={{ borderColor: colors.border }}>
                {(['editor', 'viewer'] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    className="px-3 py-1.5"
                    style={{ backgroundColor: role === r ? colors.accent : 'transparent' }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: role === r ? colors.accentText : colors.secondaryText }}
                    >
                      {r === 'editor' ? '✏️ Editor' : '👁 Viewer'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {error ? (
              <Text style={{ color: colors.error }} className="mb-2 text-xs font-semibold">
                {error}
              </Text>
            ) : null}

            <PrimaryButton fullWidth loading={submitting} disabled={!selected} onPress={() => void submit()}>
              {selected ? `Invite ${selected.fullName.split(' ')[0]}` : 'Select a friend'}
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}
