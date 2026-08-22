# i18n manual migration review

Mode: dry-run

Safe auto-migrations: 13
Manual review candidates: 351

## Manual review queue

| Platform | File | Line | Risk | Expression | Suggested key | Variables |
| --- | --- | ---: | --- | --- | --- | --- |
| Web | apps/web/src/components/focus/FocusSoundsPanel.tsx | 5 | dynamic_complex | ``focusUi.sound.${sound.id}`` | `focusSoundsPanel.reviewRequired` |  |
| Web | apps/web/src/components/focus/FocusSoundsPanel.tsx | 5 | dynamic_complex | ``focusUi.sound.${category}`` | `focusSoundsPanel.reviewRequired` |  |
| Web | apps/web/src/components/focus/FocusSoundsPanel.tsx | 6 | dynamic_complex | ``rounded-2xl border p-3 ${active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]' : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'}`` | `focusSoundsPanel.reviewRequired` |  |
| Web | apps/web/src/components/focus/FocusSoundsPanel.tsx | 6 | dynamic_simple | `active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]' : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'` | `focusSoundsPanel.reviewRequired` |  |
| Web | apps/web/src/components/focus/SharedFocusExperienceAdapter.tsx | 29 | dynamic_simple | `paused ? 'paused' : 'active'` | `sharedFocusExperienceAdapter.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 29 | dynamic_simple | `canEditShared ? 'shared' : 'personal'` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 61 | manual_translation_required | `🎯 Focus Audience` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 70 | dynamic_complex | ``px-3 py-1 text-[11px] font-bold capitalize transition disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === option
                  ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]'
                  : 'text-[var(--bp-muted)] hover:text-[var(--bp-text)]'
              }`` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 71 | dynamic_simple | `tab === option
                  ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]'
                  : 'text-[var(--bp-muted)] hover:text-[var(--bp-text)]'` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 85 | manual_translation_required | `A shared focus task appears in the Focus Queue for every member of this task.` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 93 | manual_translation_required | `Enable shared focus` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 99 | manual_translation_required | `A personal focus task appears only in your own Focus Queue.` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/features/collaboration/components/FocusAudienceSection.tsx | 108 | manual_translation_required | `Enable personal focus` | `focusAudienceSection.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 42 | dynamic_complex | ``${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 254 | dynamic_complex | ``${roomId}:${room.commitment.id}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 334 | dynamic_complex | ``${window.location.origin}/focus/rooms/${room!.id}?invite=${encodeURIComponent(invite.inviteCode)}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 341 | dynamic_complex | ``Invitation sent to ${normalized}.`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 368 | manual_translation_required | `← Focus` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 389 | manual_translation_required | `Session invitations` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 398 | manual_translation_required | `Expires` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 412 | manual_translation_required | `Reject` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 424 | manual_translation_required | `Accept` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 465 | manual_translation_required | `Room title` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 474 | manual_translation_required | `Session duration` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 477 | manual_translation_required | `Goal label` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 477 | manual_translation_required | `(optional)` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 478 | manual_translation_required | `Study for the exam` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 480 | manual_translation_required | `Once focus starts, this session locks. Nobody else can join and leaving ends it for everyone.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 516 | manual_translation_required | `Loading room…` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 525 | dynamic_simple | `active ? "min-h-screen w-screen overflow-x-hidden bg-slate-950" : "min-h-screen p-4 md:p-7"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 526 | dynamic_simple | `active ? "min-h-screen w-screen" : "mx-auto max-w-6xl"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 533 | manual_translation_required | `← Back to Sessions` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 543 | manual_translation_required | `participants` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 547 | manual_translation_required | `Invite code` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 565 | manual_translation_required | `Leave` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 570 | manual_translation_required | `Leaving early ends the shared session for everyone.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 595 | dynamic_simple | `room.commitment?.status === "completed" ? "Shared Focus Session Complete" : "Session ended early"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 604 | dynamic_complex | ``The session ended because ${actor.displayName} left.`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 607 | manual_translation_required | `Goal:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 608 | manual_translation_required | `focused together` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 609 | manual_translation_required | `Planned` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 609 | manual_translation_required | `min` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 610 | dynamic_simple | `member.userId === room.currentUserId ? " · You" : ""` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 610 | manual_translation_required | `min` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 611 | manual_translation_required | `Return to Shared Focus Sessions` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 615 | dynamic_simple | `member.state === 'offline' ? 'Reconnecting…' : 'Focusing'` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 616 | manual_translation_required | `Pause shared session` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 616 | manual_translation_required | `Keep focusing` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 616 | manual_translation_required | `Pause for everyone` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 617 | manual_translation_required | `Add time` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 617 | manual_translation_required | `min` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 618 | dynamic_complex | ``hidden relative mx-auto min-h-[72vh] max-w-4xl overflow-hidden rounded-[2rem] border p-8 text-center shadow-2xl ${room.commitment?.pausedAt ? "border-blue-400/40 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,.28),_rgba(15,23,42,.98)_62%)]" : "border-amber-300/40 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,.3),_rgba(15,23,42,.98)_62%)]"}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 618 | dynamic_simple | `room.commitment?.pausedAt ? "border-blue-400/40 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,.28),_rgba(15,23,42,.98)_62%)]" : "border-amber-300/40 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,.3),_rgba(15,23,42,.98)_62%)]"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 620 | manual_translation_required | `Shared Focus ·` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 620 | manual_translation_required | `participants` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 622 | dynamic_simple | `room.commitment?.pausedAt ? "#60a5fa" : "#fbbf24"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 622 | dynamic_complex | ``${Math.max(0, Math.min(283, ((room.commitment?.durationMinutes ?? 1) * 60 - (remaining ?? 0)) / ((room.commitment?.durationMinutes ?? 1) * 60) * 283))} 283`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 623 | manual_translation_required | `minutes ·` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 623 | manual_translation_required | `participants` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 625 | dynamic_simple | `member.state === "offline" ? "Reconnecting…" : "Focusing"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 627 | manual_translation_required | `Leaving, finishing, or cancelling ends this shared session for everyone.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 628 | manual_translation_required | `Finish for everyone` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 632 | manual_translation_required | `Add time` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 634 | manual_translation_required | `Pause this shared session for everyone?` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 634 | manual_translation_required | `Keep focusing` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 634 | manual_translation_required | `Pause for everyone` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 635 | manual_translation_required | `Add time to this session for everyone?` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 635 | manual_translation_required | `min` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 644 | manual_translation_required | `Shared Focus` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 653 | dynamic_complex | ``${readyCount} of ${room.members.length} participants ready`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 654 | dynamic_complex | ``${room.members.length} participants in the room`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 656 | manual_translation_required | `Goal:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 664 | manual_translation_required | `min focus` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 664 | dynamic_complex | ``${room.commitment.breakMinutes} min break`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 664 | manual_translation_required | `sec reconnect` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 665 | manual_translation_required | `Stay together` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 666 | manual_translation_required | `If someone leaves after the session starts, the shared session ends for everyone.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 668 | manual_translation_required | `Duration:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 668 | manual_translation_required | `minutes` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 670 | manual_translation_required | `Break:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 672 | dynamic_complex | ``${room.commitment.breakMinutes} minutes`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 676 | manual_translation_required | `Reconnect grace:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 677 | manual_translation_required | `seconds` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 681 | manual_translation_required | `preparing` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 685 | manual_translation_required | `Session starts when everyone is ready.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 694 | manual_translation_required | `I accept the collective-end rule.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 713 | dynamic_simple | `currentMember?.ready ? "Ready ✓" : "I'm Ready"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 744 | manual_translation_required | `Set Up Commitment Session` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 777 | dynamic_simple | `member.userId === room.currentUserId ? " · You" : ""` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 780 | dynamic_complex | ``text-xs font-bold ${member.ready ? "text-[var(--bp-success)]" : "text-[var(--bp-muted)]"}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 780 | dynamic_simple | `member.ready ? "text-[var(--bp-success)]" : "text-[var(--bp-muted)]"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 791 | manual_translation_required | `Pending Invitations` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 801 | manual_translation_required | `Create invite` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 806 | manual_translation_required | `No invitations yet.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 823 | manual_translation_required | `Sent` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 825 | manual_translation_required | `Expires` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 837 | manual_translation_required | `Revoke` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 846 | manual_translation_required | `Activity` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 849 | manual_translation_required | `No activity yet.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 873 | manual_translation_required | `Invite someone to this Shared Focus Session` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 880 | manual_translation_required | `Invitation type` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 885 | dynamic_complex | ``min-h-11 rounded-xl border px-3 ${inviteType === "email" ? "border-amber-400 bg-amber-400/15" : ""}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 885 | dynamic_simple | `inviteType === "email" ? "border-amber-400 bg-amber-400/15" : ""` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 892 | manual_translation_required | `Invite by email` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 897 | dynamic_complex | ``min-h-11 rounded-xl border px-3 ${inviteType === "link" ? "border-amber-400 bg-amber-400/15" : ""}`` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 897 | dynamic_simple | `inviteType === "link" ? "border-amber-400 bg-amber-400/15" : ""` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 904 | manual_translation_required | `Create invite link` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 913 | manual_translation_required | `Email address` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 923 | manual_translation_required | `name@example.com` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 929 | manual_translation_required | `Create a secure, revocable link. An empty email will never create a link automatically.` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 937 | manual_translation_required | `Expires after` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 945 | manual_translation_required | `1 hour` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 946 | manual_translation_required | `24 hours` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 947 | manual_translation_required | `3 days` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 948 | manual_translation_required | `7 days` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 962 | manual_translation_required | `Invite link` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 979 | manual_translation_required | `Copy` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 998 | dynamic_simple | `inviteType === "email"
                    ? "Send Invite"
                    : "Create Link"` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 1007 | manual_translation_required | `End the session for everyone?` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 1012 | manual_translation_required | `Remaining:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 1012 | manual_translation_required | `· Affected participants:` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 1021 | manual_translation_required | `Stay in Session` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusRoomsScreen.tsx | 1035 | manual_translation_required | `End for Everyone` | `focusRooms.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 77 | dynamic_complex | ``${item.subtaskTitle ?? ''} ${item.taskTitle}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 285 | dynamic_complex | ``${stats.currentStreak}d`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 436 | dynamic_complex | ``${completedSubtasks}/${task.subtasks.length} ${t('focusHome.done')}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 437 | dynamic_complex | ``${task.progress}%`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 442 | dynamic_complex | ``h-1.5 rounded-full ${
            task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[var(--bp-accent)]'
          }`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 443 | dynamic_simple | `task.progress === 0 ? 'bg-slate-600' : 'bg-[var(--bp-accent)]'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 445 | dynamic_complex | ``${task.progress}%`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 511 | dynamic_simple | `status === 'cancelled'
        ? 'bg-red-500/20 text-red-300'
        : 'bg-blue-500/20 text-blue-300'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 515 | dynamic_complex | ``rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 536 | dynamic_complex | ``focusHome.${type === 'pomodoro' ? 'pomodoro' : type === 'deep' ? 'deep' : type === 'long' ? 'long' : 'custom'}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 536 | needs_hook_injection | `type === 'long' ? 'long' : 'custom'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 537 | dynamic_complex | ``focusHome.${type === 'pomodoro' ? 'pomodoroDescription' : type === 'deep' ? 'deepDescription' : type === 'long' ? 'longDescription' : 'customDescription'}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 537 | needs_hook_injection | `type === 'long' ? 'longDescription' : 'customDescription'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 554 | dynamic_complex | ``rounded-2xl border px-4 py-3 text-start transition active:scale-[0.98] ${
                selected === item.type
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] hover:border-[var(--bp-accent)]/50'
              }`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 555 | dynamic_simple | `selected === item.type
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] hover:border-[var(--bp-accent)]/50'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 562 | dynamic_complex | `` · ${item.minutes}m`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 604 | dynamic_simple | `type === 'In Progress'
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-slate-500/20 text-[var(--bp-subtle)]'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 607 | dynamic_complex | ``rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 611 | dynamic_complex | ``focusHome.${type === 'pomodoro' ? 'pomodoro' : type === 'deep' ? 'deep' : type === 'long' ? 'long' : 'custom'}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 611 | needs_hook_injection | `type === 'long' ? 'long' : 'custom'` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusScreen.tsx | 624 | dynamic_complex | ``${datePart} · ${dueTime}`` | `focus.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 611 | dynamic_complex | ``rounded-2xl border px-3 py-3 text-sm font-black transition active:scale-[0.98] ${
                selected === option
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'
              }`` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 612 | dynamic_simple | `selected === option
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 623 | dynamic_complex | ``rounded-2xl border px-3 py-3 text-sm font-black transition active:scale-[0.98] ${
              selected === 'custom'
                ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'
            }`` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 624 | dynamic_simple | `selected === 'custom'
                ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 884 | dynamic_complex | ``rounded-2xl border p-3 transition ${
                        active
                          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]'
                          : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'
                      }`` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 885 | dynamic_simple | `active
                          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]'
                          : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 909 | dynamic_simple | `playing ? '⏸ Pause' : '▶ Play'` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 1015 | dynamic_complex | ``rounded-xl px-3 py-2 text-xs font-bold transition hover:bg-[var(--bp-bg)] ${
        accent ? 'text-[var(--bp-accent-ink)]' : 'text-[var(--bp-muted)]'
      }`` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 1016 | dynamic_simple | `accent ? 'text-[var(--bp-accent-ink)]' : 'text-[var(--bp-muted)]'` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 1078 | dynamic_simple | `normalized === 'low'
          ? 'bg-green-500/20 text-green-300'
          : 'bg-slate-500/20 text-[var(--bp-subtle)]'` | `focusSession.reviewRequired` |  |
| Web | apps/web/src/screens/FocusSessionScreen.tsx | 1081 | dynamic_complex | ``rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${color}`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 9 | dynamic_simple | `canEditShared ? 'shared' : 'personal'` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 12 | manual_translation_required | `Focus audience` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 12 | manual_translation_required | `Focus Audience` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 12 | manual_translation_required | `A shared focus task appears in the Focus Queue for every member of this task.` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 12 | manual_translation_required | `Enable shared focus` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 12 | manual_translation_required | `A personal focus task appears only in your own Focus Queue.` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/collaboration/components/FocusAudienceSection.tsx | 12 | manual_translation_required | `Enable personal focus` | `focusAudienceSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSection.tsx | 96 | manual_translation_required | `App blocking needs a development build (not available in Expo Go). You can still choose apps now — blocking activates once you run a dev/release build.` | `strictModeSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSection.tsx | 139 | manual_translation_required | `Usage Access permission is required — you'll be prompted when you start.` | `strictModeSection.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 144 | manual_translation_required | `Strict Focus Mode` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 154 | manual_translation_required | `Block distracting apps until your focus session finishes.` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 160 | manual_translation_required | `Android only` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 181 | manual_translation_required | `Usage Access needed` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 190 | manual_translation_required | `BeePlan needs Usage Access to detect which app is in the foreground so it can enforce blocking. It is never used for anything else.` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 198 | manual_translation_required | `Open Settings` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 202 | manual_translation_required | `I've granted it` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 210 | manual_translation_required | `Requires a development build` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 218 | dynamic_complex | ``${colors.warning}22`` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 234 | manual_translation_required | `Recommended: Display over other apps` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 243 | manual_translation_required | `Without this, the block screen may not reliably appear on Android 14+. Blocking still logs attempts, but granting this makes it dependable.` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 251 | manual_translation_required | `Grant permission` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 256 | manual_translation_required | `Enable Strict Mode` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 259 | manual_translation_required | `Allow emergency exit` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 272 | manual_translation_required | `Apps to block (` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 285 | manual_translation_required | `Install a BeePlan development or release build on Android to browse installed apps here.` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 288 | dynamic_complex | `` ${selected.size} previously selected app${selected.size === 1 ? "" : "s"} will stay saved.`` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 288 | dynamic_simple | `selected.size === 1 ? "" : "s"` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 297 | manual_translation_required | `Search apps` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictModeSetupSheet.tsx | 336 | dynamic_simple | `saving ? "Saving…" : "Save"` | `strictModeSetup.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 54 | manual_translation_required | `Focus session summary` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 57 | manual_translation_required | `Focused` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 58 | manual_translation_required | `Blocked attempts` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 71 | dynamic_simple | `completedNormally ? 'success' : 'muted'` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 72 | dynamic_simple | `endReason ? 'Ended early' : 'In progress'` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 74 | manual_translation_required | `Used emergency exit` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 78 | manual_translation_required | `By app` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 107 | manual_translation_required | `Last at` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 120 | manual_translation_required | `No blocked attempts — nice focus. 🐝` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 134 | manual_translation_required | `Done` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 165 | dynamic_complex | ``${color}33`` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 172 | dynamic_complex | ``${minutes}m`` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 175 | dynamic_complex | ``${h}h ${m}m`` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/features/focus/StrictStatsSheet.tsx | 175 | dynamic_complex | ``${h}h`` | `strictStats.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 136 | dynamic_complex | ``${room!.title}: ${created.inviteCode}`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 141 | dynamic_complex | ``Invitation sent to ${normalized}.`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 177 | dynamic_complex | ``${room.id}:${room.commitment.id}`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 230 | manual_translation_required | `min` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 270 | manual_translation_required | `Shared focus session invitation` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 282 | manual_translation_required | `Reject` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 291 | manual_translation_required | `Accept` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 310 | manual_translation_required | `Shared session` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 313 | manual_translation_required | `Leaving early ends the shared session for everyone.` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 316 | manual_translation_required | `participants` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 363 | dynamic_simple | `room.mode === "commitment"
              ? "🔒 Leaving early ends the session for everyone"
              : "Join or leave at any time"` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 401 | dynamic_complex | ``The session ended because ${actor.displayName} left.`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 411 | manual_translation_required | `Remaining at termination:` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 411 | manual_translation_required | `minutes` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 412 | manual_translation_required | `End reason:` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 415 | manual_translation_required | `minutes` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 421 | dynamic_complex | ``${t("sharedFocus.sharedFocus")} · ${room.members.length} ${t("sharedFocus.participants")}`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 421 | dynamic_complex | ``${Math.floor(activeRemainingSeconds / 60).toString().padStart(2, "0")}:${(activeRemainingSeconds % 60).toString().padStart(2, "0")}`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 421 | dynamic_complex | ``${Math.round(activeProgress * 100)}% complete`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 438 | dynamic_simple | `active ? "In focus" : "Ready"` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 452 | manual_translation_required | `minutes ·` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 453 | manual_translation_required | `s reconnect grace` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 458 | manual_translation_required | `Accept commitment agreement` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 477 | dynamic_complex | ``${t("sharedFocus.ready")} ✓`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 489 | manual_translation_required | `Set Up Commitment Session` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 504 | manual_translation_required | `Pending Invitations` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 513 | manual_translation_required | `Create invite` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 527 | manual_translation_required | `· expires` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 538 | manual_translation_required | `Revoke` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 545 | manual_translation_required | `No invitations yet.` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 562 | dynamic_complex | `` · ${t("sharedFocus.you")}`` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 566 | manual_translation_required | `You no longer have access to this private session. Return to your sessions and join with a valid code.` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 575 | manual_translation_required | `Leave session` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 610 | manual_translation_required | `Invite someone to this Shared Focus Session` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 614 | manual_translation_required | `Invite by email` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 617 | manual_translation_required | `Create invite link` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 623 | manual_translation_required | `Email address` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 628 | manual_translation_required | `name@example.com` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 641 | manual_translation_required | `Create a separate secure link. Empty email never creates a link.` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 664 | dynamic_simple | `inviteType === "email"
                    ? "Send Invite"
                    : "Create Invite Link"` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 690 | manual_translation_required | `End the session for everyone?` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 693 | manual_translation_required | `You agreed to stay until the shared session ends. Leaving now will end the Commitment Session for all participants.` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 697 | manual_translation_required | `Affected participants:` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 701 | manual_translation_required | `Stay in Session` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusRoomsScreen.tsx | 721 | manual_translation_required | `End for Everyone` | `focusRooms.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 297 | manual_translation_required | `Focus Mode` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 297 | manual_translation_required | `Your deep-work control center` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 298 | manual_translation_required | `Shared Focus Sessions` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 298 | manual_translation_required | `Start and finish a synchronized focus session together.` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 298 | manual_translation_required | `Explore sessions` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 323 | manual_translation_required | `Focus Queue ·` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 323 | manual_translation_required | `items` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 347 | manual_translation_required | `No focus tasks yet` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 353 | manual_translation_required | `Turn on Focus Task from Task Details to add it here.` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 362 | manual_translation_required | `Today's Sessions` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 421 | manual_translation_required | `Focus session in progress` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 443 | dynamic_complex | ``${remaining} remaining`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 447 | manual_translation_required | `Resume Session` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 465 | ambiguous_copy | `Focus today` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 468 | ambiguous_copy | `Sessions` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 473 | ambiguous_copy | `Streak` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 473 | dynamic_complex | ``${stats.currentStreak}d`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 475 | ambiguous_copy | `This week` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 478 | ambiguous_copy | `Top task` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 534 | manual_translation_required | `Recommended now` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 537 | manual_translation_required | `No suggestion yet — mark a task as a focus task to get a recommendation.` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 557 | dynamic_simple | `isSubtask ? "Do this now" : "Recommended now"` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 572 | manual_translation_required | `Estimated:` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 576 | manual_translation_required | `Reason:` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 580 | manual_translation_required | `Start Focus` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 592 | manual_translation_required | `Due` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 592 | manual_translation_required | `Est.` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 592 | dynamic_simple | `item.hasOpenDependencies ? 'Waiting' : 'Ready'` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 592 | manual_translation_required | `Start Focus` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 644 | manual_translation_required | `Due` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 649 | manual_translation_required | `Est.` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 658 | manual_translation_required | `Subtasks` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 661 | dynamic_complex | ``${completed}/${task.subtasks.length}`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 666 | manual_translation_required | `Progress` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 666 | dynamic_complex | ``${task.progress}%`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 676 | dynamic_complex | ``${task.progress}%`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 695 | manual_translation_required | `Start Focus` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 750 | manual_translation_required | `No sessions yet today. Start one from the queue above.` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 848 | manual_translation_required | `Start Focus Session` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 879 | dynamic_complex | `` · ${item.minutes}m`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 897 | manual_translation_required | `Minutes` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 921 | dynamic_complex | ``${colors.warning}22`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 946 | manual_translation_required | `min` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 969 | dynamic_complex | ``${color}33`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 991 | dynamic_complex | ``${color}33`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 1017 | dynamic_complex | ``${color}33`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusScreen.tsx | 1039 | dynamic_complex | ``${datePart} · ${dueTime}`` | `focus.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 156 | manual_translation_required | `BeePlan Focus` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 166 | dynamic_complex | ``${labelForFocusType(active.sessionType)} • ${active.plannedMinutes} min`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 171 | dynamic_complex | ``Paused • ${percent}%`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 171 | dynamic_complex | ``${percent}% complete`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 233 | manual_translation_required | `Ambient` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 237 | manual_translation_required | `🎧 Playing:` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 556 | dynamic_complex | ``${sound.name} sound`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 564 | manual_translation_required | `Currently Playing` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 576 | dynamic_simple | `playing ? '⏸ Pause' : '▶ Play'` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 641 | dynamic_complex | ``${Math.round(value * 100)}%`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 720 | manual_translation_required | `Break` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 727 | manual_translation_required | `Relax — no task prompt after this.` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 731 | manual_translation_required | `End break` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 753 | dynamic_complex | ``${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 775 | manual_translation_required | `Nice work — take a break?` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 780 | manual_translation_required | `min` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 784 | manual_translation_required | `Skip break` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 796 | manual_translation_required | `Break finished` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 799 | manual_translation_required | `Ready for another focus session?` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 803 | manual_translation_required | `Back to Focus` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 834 | manual_translation_required | `Great job!` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 837 | manual_translation_required | `You completed` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 837 | dynamic_simple | `minutes === 1 ? 'minute' : 'minutes'` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 837 | manual_translation_required | `of focus.` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 840 | manual_translation_required | `Did you finish this` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 840 | dynamic_simple | `isSubtask ? 'subtask' : 'task'` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 845 | manual_translation_required | `Mark Complete` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 848 | manual_translation_required | `Continue Later` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 851 | manual_translation_required | `Add More Time` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 857 | manual_translation_required | `Yes, mark task done` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 860 | manual_translation_required | `Partially completed` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 863 | manual_translation_required | `Not yet` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 878 | manual_translation_required | `Leave focus?` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 881 | manual_translation_required | `A focus session is still active. Leave anyway?` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 886 | manual_translation_required | `Stay` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 891 | manual_translation_required | `Leave` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 938 | manual_translation_required | `Add more time` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 941 | manual_translation_required | `Extend your focus session.` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 974 | manual_translation_required | `Custom` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 982 | manual_translation_required | `Minutes (` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1014 | dynamic_complex | ``Add ${validation.minutes} min`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1052 | dynamic_complex | ``${color}33`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1085 | dynamic_complex | ``${colors.error}18`` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1087 | manual_translation_required | `App blocking did not activate` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1090 | manual_translation_required | `Your focus timer is still running normally.` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1100 | manual_translation_required | `Activating app blocking…` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1112 | manual_translation_required | `Strict Mode active` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1117 | dynamic_simple | `usageAccess ? 'Usage Access ✓' : 'Permission lost'` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1124 | manual_translation_required | `Blocking` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1127 | manual_translation_required | `app` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1127 | dynamic_simple | `blockedCount === 1 ? '' : 's'` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1132 | manual_translation_required | `Blocked attempts` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1140 | manual_translation_required | `View details` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1147 | manual_translation_required | `Usage Access was revoked — blocking can't enforce until it's re-granted.` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1165 | ambiguous_copy | `Real emergency` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1166 | ambiguous_copy | `I need a blocked app` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1167 | ambiguous_copy | `Finished early` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1168 | ambiguous_copy | `Other reason` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1174 | manual_translation_required | `End strict session early?` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1177 | manual_translation_required | `This stops app blocking and ends your focus session. Pick a reason — it's saved to your stats.` | `focusSession.reviewRequired` |  |
| Mobile | apps/mobile/src/screens/FocusSessionScreen.tsx | 1186 | manual_translation_required | `Keep focusing` | `focusSession.reviewRequired` |  |
