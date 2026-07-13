import {
  type CollaborationPlanItem,
  type CollaborationPlanProposal,
  enforceSharedOutcomeCoverage,
  normalizeCollaborationPlanResponse,
} from './collaboration-plan.types';
import {
  buildSharedOutcomeSummary,
  sanitizeAndMinimizeDependencies,
  scheduleItems,
  validateFinalPlan,
  validateSharedOutcomeSemantics,
} from './plan-graph';

function baseItem(
  id: string,
  type: CollaborationPlanItem['activityType'],
  assignee: string,
): CollaborationPlanItem {
  return {
    proposalId: id,
    title: id,
    description: '',
    assigneeUserId: assignee,
    assigneeDisplayName: assignee,
    estimatedDurationMinutes: 30,
    suggestedStart: null,
    suggestedDue: null,
    priority: 'high',
    order: 1,
    dependsOnProposalIds: [],
    canRunInParallel: true,
    reason: '',
    assumptions: [],
    warnings: [],
    activityType: type,
    sharedSessionId: null,
  };
}

describe('shared-outcome coverage', () => {
  it('reconciles an explicit minute breakdown with the scheduled duration field', () => {
    const normalized = normalizeCollaborationPlanResponse(
      {
        items: [
          {
            proposalId: 'timed-test',
            title: 'Timed test',
            description:
              '30 min Subject 1, 30 minutes Subject 2, 30 min Subject 3, and 15 minutes Subject 4.',
            estimatedDurationMinutes: 90,
            activityType: 'practice',
          },
        ],
      },
      {
        planId: 'plan',
        now: new Date('2026-01-01T00:00:00Z'),
        eligibleMembers: new Map(),
        taskCollaborationType: 'shared_outcome',
      },
    );
    expect(normalized.items[0].estimatedDurationMinutes).toBe(105);
    expect(normalized.items[0].warnings.join(' ')).toContain(
      'corrected from 90 to 105',
    );
  });

  it('synthesizes per-section study before individual practice and error analysis for every participant', () => {
    const members = new Map([
      ['a', { userId: 'a', displayName: 'Hadeel' }],
      ['b', { userId: 'b', displayName: 'Hadeel 2' }],
    ]);
    const proposal: CollaborationPlanProposal = {
      planId: 'plan',
      generatedAt: new Date(0).toISOString(),
      source: 'ai',
      taskCollaborationType: 'shared_outcome',
      recoveryMode: false,
      summary: '',
      items: [
        {
          ...baseItem('subject-1', 'preparation', 'a'),
          title: 'Prepare Subject 1',
        },
        {
          ...baseItem('subject-2', 'preparation', 'b'),
          title: 'Prepare Subject 2',
        },
        {
          ...baseItem('subjects-3-4', 'preparation', 'a'),
          title: 'Prepare Subjects 3–4',
        },
      ],
      workloadByMember: [],
      totalEstimatedMinutes: 90,
      deadlineFeasible: true,
      risks: [],
      unassignedWork: [],
      reviewMilestone: null,
      suggestedBufferMinutes: null,
      warnings: [],
      assumptions: [],
    };
    const enforced = enforceSharedOutcomeCoverage(proposal, {
      requiredParticipantIds: ['a', 'b'],
      eligibleMembers: members,
      existingTitles: new Set(),
      now: new Date(),
      defaultStudyMinutes: 30,
      defaultPracticeMinutes: 30,
      defaultErrorAnalysisMinutes: 15,
    });

    for (const participant of ['a', 'b']) {
      const studies = enforced.items.filter(
        (entry) =>
          entry.assigneeUserId === participant &&
          entry.activityType === 'study_review',
      );
      expect(studies).toHaveLength(4);
      expect(
        new Set(studies.flatMap((entry) => entry.dependsOnProposalIds)),
      ).toEqual(new Set(['subject-1', 'subject-2', 'subjects-3-4']));
      const practice = enforced.items.find(
        (entry) =>
          entry.assigneeUserId === participant &&
          entry.activityType === 'practice',
      )!;
      expect(new Set(practice.dependsOnProposalIds)).toEqual(
        new Set(studies.map((entry) => entry.proposalId)),
      );
      const error = enforced.items.find(
        (entry) =>
          entry.assigneeUserId === participant &&
          entry.activityType === 'error_analysis',
      )!;
      expect(error.dependsOnProposalIds).toEqual([practice.proposalId]);
    }

    const sanitized = sanitizeAndMinimizeDependencies(enforced.items).items;
    const scheduled = scheduleItems(sanitized, {
      now: new Date('2026-01-01T09:00:00Z'),
      taskDueDate: null,
      recoveryMode: false,
    }).items;
    expect(validateFinalPlan(scheduled, ['a', 'b'])).toEqual([]);
    expect(scheduled).toHaveLength(enforced.items.length);
  });

  it('repairs stale dependencies on existing practice and error-analysis items', () => {
    const members = new Map([['a', { userId: 'a', displayName: 'A' }]]);
    const prep = baseItem('prep', 'preparation', 'a');
    const practice = {
      ...baseItem('practice', 'practice', 'a'),
      dependsOnProposalIds: ['future-error'],
    };
    const error = {
      ...baseItem('future-error', 'error_analysis', 'a'),
      dependsOnProposalIds: ['prep'],
    };
    const proposal = {
      planId: 'plan',
      generatedAt: new Date(0).toISOString(),
      source: 'ai' as const,
      taskCollaborationType: 'shared_outcome' as const,
      recoveryMode: false,
      summary: '',
      items: [prep, practice, error],
      workloadByMember: [],
      totalEstimatedMinutes: 90,
      deadlineFeasible: true,
      risks: [],
      unassignedWork: [],
      reviewMilestone: null,
      suggestedBufferMinutes: null,
      warnings: [],
      assumptions: [],
    };
    const result = enforceSharedOutcomeCoverage(proposal, {
      requiredParticipantIds: ['a'],
      eligibleMembers: members,
      existingTitles: new Set(),
      now: new Date(),
      defaultStudyMinutes: 30,
      defaultPracticeMinutes: 30,
      defaultErrorAnalysisMinutes: 15,
    });
    const study = result.items.find(
      (entry) => entry.activityType === 'study_review',
    )!;
    expect(
      result.items.find((entry) => entry.proposalId === 'practice')!
        .dependsOnProposalIds,
    ).toEqual([study.proposalId]);
    const errorDependencies = result.items.find(
      (entry) => entry.proposalId === 'future-error',
    )!.dependsOnProposalIds;
    expect(errorDependencies).toContain('practice');
    expect(
      errorDependencies.some((id) => id.startsWith('synth-practice-')),
    ).toBe(true);
  });

  it('replaces an unassigned shared session with synchronized attendee items', () => {
    const members = new Map([
      ['a', { userId: 'a', displayName: 'A' }],
      ['b', { userId: 'b', displayName: 'B' }],
    ]);
    const session = {
      ...baseItem('shared-test', 'shared_session', ''),
      assigneeUserId: null,
      assigneeDisplayName: null,
      title: 'Shared timed practice test',
      estimatedDurationMinutes: 60,
    };
    const proposal = {
      planId: 'plan',
      generatedAt: new Date(0).toISOString(),
      source: 'ai' as const,
      taskCollaborationType: 'shared_outcome' as const,
      recoveryMode: false,
      summary: '',
      items: [session],
      workloadByMember: [],
      totalEstimatedMinutes: 60,
      deadlineFeasible: true,
      risks: [],
      unassignedWork: [],
      reviewMilestone: null,
      suggestedBufferMinutes: null,
      warnings: [],
      assumptions: [],
    };
    const result = enforceSharedOutcomeCoverage(proposal, {
      requiredParticipantIds: ['a', 'b'],
      eligibleMembers: members,
      existingTitles: new Set(),
      now: new Date(),
      defaultStudyMinutes: 30,
      defaultPracticeMinutes: 30,
      defaultErrorAnalysisMinutes: 15,
    });
    const attendees = result.items.filter(
      (entry) => entry.activityType === 'shared_session',
    );
    expect(attendees.map((entry) => entry.assigneeUserId).sort()).toEqual([
      'a',
      'b',
    ]);
    expect(
      new Set(attendees.map((entry) => entry.sharedSessionId)),
    ).toHaveProperty('size', 1);
    expect(attendees[0].dependsOnProposalIds).toEqual(
      attendees[1].dependsOnProposalIds,
    );
    expect(attendees[0].dependsOnProposalIds).not.toContain(
      attendees[1].proposalId,
    );
    expect(attendees[1].dependsOnProposalIds).not.toContain(
      attendees[0].proposalId,
    );
    const scheduled = scheduleItems(
      sanitizeAndMinimizeDependencies(result.items).items,
      {
        now: new Date('2026-01-01T09:00:00Z'),
        taskDueDate: null,
        recoveryMode: false,
      },
    ).items;
    const scheduledAttendees = scheduled.filter(
      (entry) => entry.activityType === 'shared_session',
    );
    expect(
      new Set(scheduledAttendees.map((entry) => entry.suggestedStart)),
    ).toHaveProperty('size', 1);
    expect(
      new Set(scheduledAttendees.map((entry) => entry.suggestedDue)),
    ).toHaveProperty('size', 1);
  });

  it('preserves subject identity and repairs full semantic study/practice coverage', () => {
    const members = new Map([
      ['a', { userId: 'a', displayName: 'Hadeel' }],
      ['b', { userId: 'b', displayName: 'Hadeel2' }],
    ]);
    const preparations = [1, 2].map((subject, index) => ({
      ...baseItem(`prep-${subject}`, 'preparation', index % 2 ? 'b' : 'a'),
      title: `Prepare Subject ${subject}`,
    }));
    const studyA1 = {
      ...baseItem('study-a-1', 'study_review', 'a'),
      title: 'Review Subject 1',
      dependsOnProposalIds: ['prep-1'],
    };
    const studyB2 = {
      ...baseItem('study-b-2', 'study_review', 'b'),
      title: 'Review Subject 2',
      dependsOnProposalIds: ['prep-2'],
    };
    const practiceA1 = {
      ...baseItem('practice-a-1', 'practice', 'a'),
      title: 'Practice Subject 1',
      dependsOnProposalIds: ['study-b-2'],
    };
    const practiceB2 = {
      ...baseItem('practice-b-2', 'practice', 'b'),
      title: 'Practice Subject 2',
      dependsOnProposalIds: ['study-a-1'],
    };
    const mock = {
      ...baseItem('mock', 'shared_session', ''),
      title: 'Full timed mock exam — all subjects',
      assigneeUserId: null,
      assigneeDisplayName: null,
    };
    const sharedReview = {
      ...baseItem('shared-review', 'shared_session', ''),
      title: 'Shared review Subjects 3 & 4',
      assigneeUserId: null,
      assigneeDisplayName: null,
    };
    const finalCheck = {
      ...baseItem('final-check', 'production', 'a'),
      title: 'Final cross-check & resource consolidation',
    };
    const proposal = {
      planId: 'semantic-plan',
      generatedAt: new Date(0).toISOString(),
      source: 'ai' as const,
      taskCollaborationType: 'shared_outcome' as const,
      recoveryMode: false,
      summary: 'Unverified full coverage.',
      items: [
        ...preparations,
        studyA1,
        studyB2,
        practiceA1,
        practiceB2,
        mock,
        sharedReview,
        finalCheck,
      ],
      workloadByMember: [],
      totalEstimatedMinutes: 0,
      deadlineFeasible: true,
      risks: [],
      unassignedWork: [],
      reviewMilestone: null,
      suggestedBufferMinutes: null,
      warnings: [],
      assumptions: [],
    };
    const enforced = enforceSharedOutcomeCoverage(proposal, {
      requiredParticipantIds: ['a', 'b'],
      eligibleMembers: members,
      existingTitles: new Set(),
      now: new Date(),
      defaultStudyMinutes: 30,
      defaultPracticeMinutes: 30,
      defaultErrorAnalysisMinutes: 15,
    });

    const practiceA = enforced.items.find(
      (item) => item.proposalId === 'practice-a-1',
    )!;
    const practiceB = enforced.items.find(
      (item) => item.proposalId === 'practice-b-2',
    )!;
    expect(practiceA.dependsOnProposalIds).toEqual(['study-a-1']);
    expect(practiceB.dependsOnProposalIds).toEqual(['study-b-2']);

    for (const participantId of ['a', 'b']) {
      const studies = enforced.items.filter(
        (item) =>
          item.assigneeUserId === participantId &&
          item.activityType === 'study_review' &&
          !item.sharedSessionId,
      );
      expect(
        new Set(
          studies.flatMap((item) => item.title.match(/Subject \d+/g) ?? []),
        ),
      ).toEqual(new Set(['Subject 1', 'Subject 2', 'Subject 3', 'Subject 4']));
      expect(
        enforced.items.some(
          (item) =>
            item.assigneeUserId === participantId &&
            item.activityType === 'practice' &&
            /full[- ]scope/i.test(item.title),
        ),
      ).toBe(true);
    }

    const mockAttendees = enforced.items.filter(
      (item) => item.sharedSessionId && /mock exam/i.test(item.title),
    );
    const personalPracticeIds = enforced.items
      .filter(
        (item) => item.activityType === 'practice' && !item.sharedSessionId,
      )
      .map((item) => item.proposalId)
      .sort();
    expect(mockAttendees).toHaveLength(2);
    expect([...mockAttendees[0].dependsOnProposalIds].sort()).toEqual(
      personalPracticeIds,
    );
    expect(mockAttendees[1].dependsOnProposalIds).toEqual(
      mockAttendees[0].dependsOnProposalIds,
    );

    const reviewAttendees = enforced.items.filter(
      (item) => item.sharedSessionId && /Shared review/i.test(item.title),
    );
    const reviewDependencyTitles = reviewAttendees[0].dependsOnProposalIds.map(
      (id) => enforced.items.find((item) => item.proposalId === id)!.title,
    );
    expect(
      reviewDependencyTitles.every((title) => /Subject (3|4)/.test(title)),
    ).toBe(true);
    expect(
      reviewDependencyTitles.some((title) => /Subject 1|Subject 2/.test(title)),
    ).toBe(false);

    expect(
      enforced.items
        .find((item) => item.proposalId === 'final-check')!
        .dependsOnProposalIds.sort(),
    ).toEqual(preparations.map((item) => item.proposalId).sort());
    expect(validateSharedOutcomeSemantics(enforced.items, ['a', 'b'])).toEqual(
      [],
    );
    expect(buildSharedOutcomeSummary(enforced.items, ['a', 'b'])).toContain(
      'Validated collaborative study plan',
    );

    const scheduled = scheduleItems(
      sanitizeAndMinimizeDependencies(enforced.items).items,
      {
        now: new Date('2026-01-01T09:00:00Z'),
        taskDueDate: null,
        recoveryMode: false,
      },
    ).items;
    for (const attendee of scheduled.filter(
      (item) => item.sharedSessionId && /mock exam/i.test(item.title),
    )) {
      expect([...attendee.dependsOnProposalIds].sort()).toEqual(
        personalPracticeIds,
      );
      const latestPrerequisiteEnd = Math.max(
        ...attendee.dependsOnProposalIds.map((id) =>
          new Date(
            scheduled.find((item) => item.proposalId === id)!.suggestedDue!,
          ).getTime(),
        ),
      );
      expect(
        new Date(attendee.suggestedStart!).getTime(),
      ).toBeGreaterThanOrEqual(latestPrerequisiteEnd);
    }
    expect(validateFinalPlan(scheduled, ['a', 'b'])).toEqual([]);
  });

  it('does not emit verified coverage claims for a semantically incomplete plan', () => {
    expect(
      buildSharedOutcomeSummary(
        [baseItem('study-a', 'study_review', 'a')],
        ['a', 'b'],
      ),
    ).toContain('unresolved coverage warnings');
  });
});
