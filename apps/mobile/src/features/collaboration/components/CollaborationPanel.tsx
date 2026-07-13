import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ApiTask } from '../../../lib/tasksApi';
import { getMembers } from '../api/collaboration.api';
import type { TaskMember } from '../types';
import { CommentsSection } from './CommentsSection';
import { MembersSection } from './MembersSection';

type Props = {
  task: ApiTask;
  currentUserId: string;
  onMembersLoaded?: (count: number) => void;
  onError?: (message: string) => void;
};

/**
 * Read-only collaboration surface for the Task Details screen: members (list
 * only) and comments. All member management (invite / role / remove /
 * transfer) lives on the Edit Task screen via {@link ManageMembersSection};
 * reminder and focus audience preferences live there too via
 * {@link ReminderAudienceSection} and {@link FocusAudienceSection}.
 */
export function CollaborationPanel({
  task,
  currentUserId,
  onMembersLoaded,
  onError,
}: Props) {
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loading, setLoading] = useState(true);

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

  const noop = () => {};

  return (
    <View>
      <MembersSection
        members={members}
        loading={loading}
        canManage={false}
        currentUserId={currentUserId}
        onInviteClick={noop}
        onChangeRole={noop}
        onRemove={noop}
        onTransfer={noop}
      />

      <CommentsSection
        taskId={task.id}
        members={members}
        currentUserId={currentUserId}
        onError={error}
      />
    </View>
  );
}
