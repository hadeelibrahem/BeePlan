import type { ReactNode } from 'react';
import type { FocusRoom } from '../../lib/focusRoomsApi';
import { FocusExperienceView } from './FocusExperienceView';
import { useLanguage } from '../../i18n/LanguageContext';

type Props = {
  room: FocusRoom;
  remainingSeconds: number;
  progress: number;
  soundPanel?: ReactNode;
  fullscreenSupported: boolean;
  isFullscreen: boolean;
  onOpenSounds: () => void;
  onToggleFullscreen: () => void;
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

export function SharedFocusExperienceAdapter({ room, remainingSeconds, progress, soundPanel, fullscreenSupported, isFullscreen, onOpenSounds, onToggleFullscreen, onPause, onResume, onAddTime, onFinish, onCancel, busy, error, participants, children }: Props) {
  const { t } = useLanguage();
  const paused = Boolean(room.commitment?.pausedAt);
  return <><FocusExperienceView title={t('focusUi.sharedSession')} goal={room.commitment?.goalLabel} durationMinutes={room.commitment?.durationMinutes ?? 0} remainingSeconds={remainingSeconds} progress={progress} isPaused={paused} state={paused ? 'paused' : 'active'} participants={participants} onOpenSounds={onOpenSounds} fullscreenSupported={fullscreenSupported} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} onExit={onCancel} onPause={onPause} onResume={onResume} onAddTime={onAddTime} onFinish={onFinish} onCancel={onCancel} busy={busy} error={error}>{children}</FocusExperienceView>{soundPanel}</>;
}
