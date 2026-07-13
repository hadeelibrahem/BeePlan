import {
  buildApplyPlan,
  computeSemanticKey,
  stripAssigneePrefix,
} from './apply-plan';
import type { ApplyCandidate } from './apply-plan';
import type { ActivityType } from './collaboration-plan.types';

function candidate(
  proposalId: string,
  activityType: ActivityType,
  assigneeUserId: string | null,
  extra: Partial<ApplyCandidate> = {},
): ApplyCandidate {
  return {
    proposalId,
    title: extra.title ?? proposalId,
    description: extra.description ?? '',
    assigneeUserId,
    activityType,
    sharedSessionId: extra.sharedSessionId ?? null,
    dependsOnProposalIds: extra.dependsOnProposalIds ?? [],
    isShared: extra.isShared ?? false,
  };
}

describe('computeSemanticKey', () => {
  it('gives full-scope practice a different key than subject-specific practice even when both mention the subject', () => {
    const fullScope = candidate('full', 'practice', 'a', {
      title: 'hadeel: full-scope practice test',
      description: 'Covers Subject 1 and everything else, complete syllabus.',
    });
    const subjectSpecific = candidate('subj1', 'practice', 'a', {
      title: 'Practice Subject 1 problems',
      description: 'Solve practice questions for Subject 1.',
    });
    expect(computeSemanticKey(fullScope)).not.toBe(
      computeSemanticKey(subjectSpecific),
    );
  });

  it('gives the same participant different keys for different learning stages sharing a title', () => {
    const study = candidate('study', 'study_review', 'a', {
      title: 'Subject 1',
    });
    const practice = candidate('practice', 'practice', 'a', {
      title: 'Subject 1',
    });
    expect(computeSemanticKey(study)).not.toBe(computeSemanticKey(practice));
  });
});

describe('buildApplyPlan', () => {
  it('collapses two proposals with the same participant/stage/subject identity, keeping the first', () => {
    const items = [
      candidate('a1', 'study_review', 'hadeel', {
        title: 'Review Subject 1 core concepts & notes',
        description: 'Study Subject 1.',
      }),
      candidate('a2', 'study_review', 'hadeel', {
        title: 'Prepare Subject 1 concept summary & annotated notes',
        description: 'Study Subject 1.',
      }),
    ];
    const result = buildApplyPlan(items);
    expect(result.keepItems.map((i) => i.proposalId)).toEqual(['a1']);
    expect(result.itemErrors).toEqual([
      {
        proposalId: 'a2',
        error:
          'Duplicate semantic identity — another item already covers this participant/stage/subject.',
      },
    ]);
  });

  it('preserves items with the same title across different semantic stages', () => {
    const items = [
      candidate('prep', 'preparation', 'hadeel', { title: 'Subject 1' }),
      candidate('study', 'study_review', 'hadeel', { title: 'Subject 1' }),
      candidate('practice', 'practice', 'hadeel', { title: 'Subject 1' }),
      candidate('error', 'error_analysis', 'hadeel', { title: 'Subject 1' }),
    ];
    const result = buildApplyPlan(items);
    expect(result.keepItems.map((i) => i.proposalId).sort()).toEqual(
      ['prep', 'study', 'practice', 'error'].sort(),
    );
    expect(result.itemErrors).toEqual([]);
  });

  it('keeps a subject-specific practice item distinct from a full-scope practice item for the same person', () => {
    const items = [
      candidate('subj1', 'practice', 'hadeel', {
        title: 'Practice Subject 1 problems',
      }),
      candidate('full', 'practice', 'hadeel', {
        title: 'hadeel: full-scope practice test',
        description: 'Covers the complete scope, all subjects.',
      }),
    ];
    const result = buildApplyPlan(items);
    expect(result.keepItems.map((i) => i.proposalId).sort()).toEqual([
      'full',
      'subj1',
    ]);
    expect(result.itemErrors).toEqual([]);
  });

  it('redirects dependencies pointing at a rejected duplicate onto the surviving canonical item', () => {
    const items = [
      candidate('a1', 'study_review', 'hadeel', { title: 'Study Subject 1' }),
      candidate('a2', 'study_review', 'hadeel', {
        title: 'Review Subject 1 material',
      }),
      candidate('practice', 'practice', 'hadeel', {
        title: 'Practice Subject 1',
        dependsOnProposalIds: ['a2'],
      }),
    ];
    const result = buildApplyPlan(items);
    const practice = result.keepItems.find((i) => i.proposalId === 'practice');
    expect(practice?.dependsOnProposalIds).toEqual(['a1']);
  });

  it('removes a stale generic unassigned item once a participant-specific equivalent survives', () => {
    const items = [
      candidate('generic-practice', 'practice', null, {
        title: 'Full timed practice test (mixed subjects)',
      }),
      candidate('generic-error', 'error_analysis', null, {
        title: 'Error analysis & final revision',
      }),
      candidate('hadeel-practice', 'practice', 'hadeel', {
        title: 'hadeel: full-scope practice test',
      }),
      candidate('hadeel-error', 'error_analysis', 'hadeel', {
        title: 'hadeel: analyze mistakes and revise weak areas',
      }),
    ];
    const result = buildApplyPlan(items);
    const ids = result.keepItems.map((i) => i.proposalId).sort();
    expect(ids).toEqual(['hadeel-error', 'hadeel-practice']);
    expect(result.itemErrors.map((e) => e.proposalId).sort()).toEqual([
      'generic-error',
      'generic-practice',
    ]);
  });

  it('keeps a generic unassigned item when no participant-specific equivalent of the same stage exists', () => {
    const items = [
      candidate('generic-practice', 'practice', null, {
        title: 'Full timed practice test (mixed subjects)',
      }),
    ];
    const result = buildApplyPlan(items);
    expect(result.keepItems.map((i) => i.proposalId)).toEqual([
      'generic-practice',
    ]);
    expect(result.itemErrors).toEqual([]);
  });

  it('keeps a generic-looking item when it carries real shared-session metadata', () => {
    const items = [
      candidate('shared-mock', 'practice', null, {
        title: 'Full timed practice test (mixed subjects)',
        sharedSessionId: 'session-1',
      }),
      candidate('hadeel-practice', 'practice', 'hadeel', {
        title: 'hadeel: full-scope practice test',
      }),
    ];
    const result = buildApplyPlan(items);
    expect(result.keepItems.map((i) => i.proposalId).sort()).toEqual([
      'hadeel-practice',
      'shared-mock',
    ]);
  });

  it('drops a dependency edge pointing at a removed generic placeholder instead of leaving it dangling', () => {
    const items = [
      candidate('generic-error', 'error_analysis', null, {
        title: 'Error analysis & final revision',
      }),
      candidate('hadeel-error', 'error_analysis', 'hadeel', {
        title: 'hadeel: analyze mistakes',
      }),
      candidate('final-review', 'other', 'hadeel', {
        title: 'Final review session',
        dependsOnProposalIds: ['generic-error'],
      }),
    ];
    const result = buildApplyPlan(items);
    const finalReview = result.keepItems.find(
      (i) => i.proposalId === 'final-review',
    );
    expect(finalReview?.dependsOnProposalIds).toEqual([]);
  });
});

describe('buildApplyPlan shared-session collapse', () => {
  it('collapses a per-attendee shared session into one shared subtask with unioned deps', () => {
    const items = [
      candidate('study-a', 'study_review', 'a', { title: 'Study Subject 1' }),
      candidate('study-b', 'study_review', 'b', { title: 'Study Subject 1' }),
      candidate('mock-a', 'shared_session', 'a', {
        title: 'Shared timed mock exam',
        sharedSessionId: 'sess-1',
        dependsOnProposalIds: ['study-a'],
      }),
      candidate('mock-b', 'shared_session', 'b', {
        title: 'Shared timed mock exam',
        sharedSessionId: 'sess-1',
        dependsOnProposalIds: ['study-b'],
      }),
    ];
    const result = buildApplyPlan(items);
    const shared = result.keepItems.filter((i) => i.isShared);
    expect(shared).toHaveLength(1);
    expect(shared[0].assigneeUserId).toBeNull();
    expect(shared[0].sharedSessionId).toBe('sess-1');
    // Union of both attendees' personal-study prerequisites.
    expect(new Set(shared[0].dependsOnProposalIds)).toEqual(
      new Set(['study-a', 'study-b']),
    );
    // Exactly one shared row persisted for the session, not one per attendee.
    expect(result.keepItems.map((i) => i.proposalId)).not.toContain('mock-b');
  });

  it('redirects an external dependency on a collapsed attendee onto the single shared item', () => {
    const items = [
      candidate('mock-a', 'shared_session', 'a', {
        title: 'Shared review',
        sharedSessionId: 'sess-1',
      }),
      candidate('mock-b', 'shared_session', 'b', {
        title: 'Shared review',
        sharedSessionId: 'sess-1',
      }),
      candidate('followup', 'error_analysis', 'a', {
        title: 'Follow-up',
        // Depends on the attendee copy that gets collapsed away.
        dependsOnProposalIds: ['mock-b'],
      }),
    ];
    const result = buildApplyPlan(items);
    const shared = result.keepItems.find((i) => i.isShared)!;
    const followup = result.keepItems.find((i) => i.proposalId === 'followup')!;
    expect(followup.dependsOnProposalIds).toEqual([shared.proposalId]);
  });

  it('leaves non-shared items with isShared false', () => {
    const items = [
      candidate('p', 'preparation', 'a', { title: 'Prep' }),
      candidate('s', 'study_review', 'a', { title: 'Study' }),
    ];
    const result = buildApplyPlan(items);
    expect(result.keepItems.every((i) => i.isShared === false)).toBe(true);
  });
});

describe('stripAssigneePrefix', () => {
  const names = new Set(['hadeel', 'hadeel 2']);

  it('removes a prefix matching a known participant name', () => {
    expect(stripAssigneePrefix('hadeel: Study Subject 1', names)).toBe(
      'Study Subject 1',
    );
    expect(stripAssigneePrefix('Hadeel 2: Practice', names)).toBe('Practice');
  });

  it('leaves a structural title with a colon intact (prefix is not a name)', () => {
    expect(
      stripAssigneePrefix('Chapter 3: The Great Migration and its effects', names),
    ).toBe('Chapter 3: The Great Migration and its effects');
  });

  it('leaves an unprefixed title unchanged', () => {
    expect(stripAssigneePrefix('Study Subject 1', names)).toBe('Study Subject 1');
  });

  it('only trims when no known names are supplied', () => {
    expect(stripAssigneePrefix('hadeel: Study Subject 1')).toBe(
      'hadeel: Study Subject 1',
    );
  });
});
