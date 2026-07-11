import { Alert, Pressable, Text, View } from 'react-native';
import { SectionCard } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { Avatar } from './Avatar';
import { RoleBadge } from './SharedBadge';
import type { TaskMember, TaskRole } from '../types';

type Props = {
  members: TaskMember[];
  loading?: boolean;
  canManage: boolean;
  currentUserId: string;
  onInviteClick: () => void;
  onChangeRole: (member: TaskMember, role: Exclude<TaskRole, 'owner'>) => void;
  onRemove: (member: TaskMember) => void;
  onTransfer: (member: TaskMember) => void;
};

export function MembersSection({
  members,
  loading,
  canManage,
  currentUserId,
  onInviteClick,
  onChangeRole,
  onRemove,
  onTransfer,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const accepted = members.filter((m) => m.status !== 'declined');
  const acceptedCount = accepted.filter((m) => m.status === 'accepted').length;

  function openMemberMenu(member: TaskMember) {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (member.role !== 'editor') {
      buttons.push({ text: '✏️ Make editor', onPress: () => onChangeRole(member, 'editor') });
    }
    if (member.role !== 'viewer') {
      buttons.push({ text: '👁 Make viewer', onPress: () => onChangeRole(member, 'viewer') });
    }
    if (member.status === 'accepted') {
      buttons.push({
        text: '👑 Transfer ownership',
        onPress: () =>
          Alert.alert(
            'Transfer ownership?',
            `${member.user.fullName} will become the owner. You will remain an editor.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Transfer', onPress: () => onTransfer(member) },
            ],
          ),
      });
    }
    buttons.push({
      text: '🗑 Remove',
      style: 'destructive',
      onPress: () =>
        Alert.alert('Remove member?', `${member.user.fullName} will lose access to this task.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => onRemove(member) },
        ]),
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(member.user.fullName, 'Manage this member', buttons);
  }

  return (
    <SectionCard className="mb-3">
      <View className="mb-3 flex-row items-center justify-between">
        <Text style={{ color: colors.text }} className="text-sm font-black">
          Members ({acceptedCount})
        </Text>
        {canManage ? (
          <Pressable
            onPress={onInviteClick}
            accessibilityRole="button"
            className="rounded-lg px-3 py-1.5"
            style={{ backgroundColor: colors.accent }}
          >
            <Text style={{ color: colors.accentText }} className="text-xs font-black">
              + Invite
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <Text style={{ color: colors.secondaryText }} className="py-2 text-xs">
          Loading members…
        </Text>
      ) : (
        <View className="gap-2">
          {accepted.map((member) => {
            const canAct = canManage && !member.isOwner && member.userId !== currentUserId;
            return (
              <Pressable
                key={member.userId}
                disabled={!canAct}
                onPress={() => canAct && openMemberMenu(member)}
                className="flex-row items-center gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: colors.border }}
              >
                <Avatar fullName={member.user.fullName} avatarUrl={member.user.avatarUrl} size={36} />
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text style={{ color: colors.text }} className="text-sm font-bold" numberOfLines={1}>
                      {member.user.fullName}
                      {member.userId === currentUserId ? ' (you)' : ''}
                    </Text>
                    {member.status === 'pending' ? (
                      <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: `${colors.warning}26` }}>
                        <Text style={{ color: colors.warning }} className="text-[9px] font-bold">
                          PENDING
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.secondaryText }} className="text-xs" numberOfLines={1}>
                    {member.user.email}
                  </Text>
                </View>
                <RoleBadge role={member.role} />
                {canAct ? (
                  <Text style={{ color: colors.secondaryText }} className="ml-1 text-base">
                    ⋯
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </SectionCard>
  );
}
