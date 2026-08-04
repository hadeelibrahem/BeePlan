import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  AssistantPriority,
  ClassifiedTaskContext,
  TimelineStageType,
} from './task-assistant.types';

export type TimelineDraft = {
  stageType: TimelineStageType;
  title: string;
  description: string;
  scheduledAt: Date | null;
  dueAt: Date | null;
  priority: AssistantPriority;
  triggerReason: string;
  fingerprint: string;
  status: 'pending' | 'skipped';
};

@Injectable()
export class ContextTimelineEngine {
  generate(
    context: ClassifiedTaskContext,
    now = new Date(),
    recommendedDeparture?: Date | null,
  ): TimelineDraft[] {
    if (
      !context.scheduledExecution ||
      ['low', 'unavailable'].includes(context.confidence)
    )
      return [];
    const start = new Date(context.scheduledExecution);
    if (Number.isNaN(start.getTime()) || start <= now) return [];
    const travel = new Set([
      context.primaryContext,
      ...context.secondaryContexts,
    ]);
    const drafts: Omit<TimelineDraft, 'fingerprint' | 'status'>[] = [];
    const add = (
      stageType: TimelineStageType,
      title: string,
      offsetMs: number,
      priority: AssistantPriority,
      reason: string,
      anchor = start,
    ) =>
      drafts.push({
        stageType,
        title,
        description: title,
        scheduledAt: new Date(anchor.getTime() - offsetMs),
        dueAt: new Date(anchor.getTime() - offsetMs),
        priority,
        triggerReason: reason,
      });
    if (travel.has('travel') || travel.has('flight')) {
      add(
        'document_check',
        'Check travel documents and current entry requirements',
        3 * 86_400_000,
        'high',
        'International travel preparation benefits from an early document check.',
      );
      add(
        'packing',
        'Finish packing',
        24 * 3_600_000,
        'medium',
        'Packing is most useful before travel day.',
      );
      const departure = recommendedDeparture ?? start;
      add(
        'final_check',
        'Complete a final document and luggage check',
        2 * 3_600_000,
        'high',
        'Final check is scheduled before departure.',
        departure,
      );
      if (recommendedDeparture)
        add(
          'departure',
          'Leave now',
          0,
          'critical',
          'Uses the deterministic recommended departure time.',
          recommendedDeparture,
        );
    } else if (travel.has('interview')) {
      add(
        'day_before',
        'Prepare CV and confirm interview details',
        18 * 3_600_000,
        'high',
        'Interview preparation is useful the evening before.',
      );
      add(
        'final_check',
        'Final interview check',
        75 * 60_000,
        'high',
        'Scheduled 75 minutes before the interview.',
      );
    } else if (travel.has('online_meeting'))
      add(
        'final_check',
        'Check meeting link and equipment',
        20 * 60_000,
        'high',
        'Online meeting equipment check.',
      );
    else
      add(
        'day_before',
        'Review preparation checklist',
        12 * 3_600_000,
        'medium',
        'Context-specific preparation review.',
      );
    return drafts.map((draft) => ({
      ...draft,
      status:
        draft.scheduledAt && draft.scheduledAt <= now ? 'skipped' : 'pending',
      fingerprint: createHash('sha256')
        .update(
          `${context.taskId}|${draft.stageType}|${draft.scheduledAt?.toISOString()}`,
        )
        .digest('hex'),
    }));
  }
}
