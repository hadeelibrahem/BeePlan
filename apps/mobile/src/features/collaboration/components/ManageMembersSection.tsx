import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ApiTask } from '../../../lib/tasksApi';
import {
  getMembers,
  removeMember as apiRemoveMember,
  transferOwnership as apiTransferOwnership,
  updateMemberRole,
} from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';
import type { TaskMember, TaskRole } from '../types';
import { InviteMemberSheet } from './InviteMemberSheet';
import { MembersSection } from './MembersSection';

type Props = {
  task: ApiTask;
  currentUserId: string;
  /** Called after ownership transfer so the parent can refetch roles/visibility. */
  onRefresh?: () => void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
  onMembersLoaded?: (count: number) => void;
};

/**
 * Full member-management surface — invite, change role, remove, and transfer
 * ownership. Lives on the Edit Task screen; Task Details renders members
 * read-only. Per-member controls only appear for owners / members with manage
 * permission (the backend enforces the same rules).
 */
export function ManageMembersSection({
  task,
  currentUserId,
  onRefresh,
  onNotice,
  onError,
  onMembersLoaded,
}: Props) {
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const canManage = task.viewerRole === 'owner' || task.canManageMembers === true;
  const notice = onNotice ?? (() => {});
  const error = onError ?? (() => {});

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getMembers(task.id);
      setMembers(rows);
      onMembersLoaded?.(rows.filter((m) => m.status === 'accepted').length);
    } catch {
      setMembers([]);
      onMembersLoaded?.(0);
    } finally {
      setLoading(false);
    }
  }, [task.id, onMembersLoaded]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleChangeRole = useCallback(
    async (member: TaskMember, role: Exclude<TaskRole, 'owner'>) => {
      const previous = members;
      setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role } : m)));
      try {
        await updateMemberRole(task.id, member.userId, role);
        notice(`${member.user.fullName} is now a ${role}.`);
      } catch (err) {
        setMembers(previous);
        error(friendlyError(err, 'Could not change the role.'));
      }
    },
    [members, task.id, notice, error],
  );

  const handleRemove = useCallback(
    async (member: TaskMember) => {
      const previous = members;
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
      try {
        await apiRemoveMember(task.id, member.userId);
        notice(`${member.user.fullName} was removed.`);
      } catch (err) {
        setMembers(previous);
        error(friendlyError(err, 'Could not remove the member.'));
      }
    },
    [members, task.id, notice, error],
  );

  const handleTransfer = useCallback(
    async (member: TaskMember) => {
      try {
        await apiTransferOwnership(task.id, member.userId);
        notice(`${member.user.fullName} is now the owner.`);
        await loadMembers();
        onRefresh?.();
      } catch (err) {
        error(friendlyError(err, 'Could not transfer ownership.'));
      }
    },
    [task.id, loadMembers, onRefresh, notice, error],
  );

  return (
    <View>
      <MembersSection
        members={members}
        loading={loading}
        canManage={canManage}
        currentUserId={currentUserId}
        onInviteClick={() => setInviteOpen(true)}
        onChangeRole={(m, role) => void handleChangeRole(m, role)}
        onRemove={(m) => void handleRemove(m)}
        onTransfer={(m) => void handleTransfer(m)}
      />

      <InviteMemberSheet
        visible={inviteOpen}
        taskId={task.id}
        existingMemberIds={members.map((m) => m.userId)}
        onClose={() => setInviteOpen(false)}
        onInvited={(member, name) => {
          setInviteOpen(false);
          setMembers((prev) => [...prev.filter((m) => m.userId !== member.userId), member]);
          notice(`Invitation sent to ${name}.`);
          onRefresh?.();
        }}
      />
    </View>
  );
}
