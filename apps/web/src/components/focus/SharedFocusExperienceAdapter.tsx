import type { ReactNode } from 'react';
import type { FocusRoom } from '../../lib/focusRoomsApi';
import { FocusExperienceView } from './FocusExperienceView';

type Props = {
  room: FocusRoom;
  remainingSeconds: number;
  progress: number;
  soundControl: ReactNode;
  soundPanel?: ReactNode;
  onPause: () => void;
  onResume: () => void;
  onAddTime?: () => void;
  onFinish: () => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
  participants: ReactNode;
  children?: ReactNode;
};

export function SharedFocusExperienceAdapter({ room, remainingSeconds, progress, soundControl, soundPanel, onPause, onResume, onAddTime, onFinish, onCancel, busy, error, participants, children }: Props) {
  const paused = Boolean(room.commitment?.pausedAt);
  return <><FocusExperienceView title="Shared Focus Session" goal={room.commitment?.goalLabel} durationMinutes={room.commitment?.durationMinutes ?? 0} remainingSeconds={remainingSeconds} progress={progress} isPaused={paused} state={paused ? 'paused' : 'active'} participants={participants} soundControl={soundControl} onPause={onPause} onResume={onResume} onAddTime={onAddTime} onFinish={onFinish} onCancel={onCancel} busy={busy} error={error}>{children}</FocusExperienceView>{soundPanel}</>;
}
