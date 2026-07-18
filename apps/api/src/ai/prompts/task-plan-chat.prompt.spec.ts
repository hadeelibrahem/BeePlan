import { buildTaskPlanChatPrompt } from './task-plan-chat.prompt';
import { DEFAULT_PLANNER_PREFERENCES } from '../planner/planner-preferences.service';
import type { PlannerPreferences } from '../planner/planner.types';
import type { ExistingTaskSummary } from '../task-plan-chat.types';

// The planning behavior itself is executed by the model, so these tests pin
// the contract we control: that every runtime context injection lands in the
// prompt, and that each behavioral rule the product depends on is actually
// stated in the instructions the model receives.

const preferences: PlannerPreferences = {
  ...DEFAULT_PLANNER_PREFERENCES,
  focusStartTime: '09:30',
  focusEndTime: '12:30',
  workBlockMinutes: 50,
  breakMinutes: 10,
};

const openTasks: ExistingTaskSummary[] = [
  {
    title: 'Finish physics lab report',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-07-20T09:00:00.000Z',
    estimatedTimeMinutes: 120,
  },
];

function build(availability?: Record<string, unknown>): string {
  return buildTaskPlanChatPrompt(openTasks, preferences, availability);
}

describe('buildTaskPlanChatPrompt', () => {
  describe('runtime context injections', () => {
    it('anchors the current date, time, and weekday', () => {
      const prompt = build();
      const year = new Date().getFullYear().toString();
      expect(prompt).toContain('Current date and time:');
      expect(prompt).toContain(year);
      expect(prompt).toMatch(
        /\((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\)/,
      );
      expect(prompt).toContain('Resolve all relative dates against this.');
    });

    it('injects the focus window and work-block preferences', () => {
      const prompt = build();
      expect(prompt).toContain('09:30-12:30');
      expect(prompt).toContain('about 50 minutes');
      expect(prompt).toContain('Leave about 10 minutes between consecutive focus sessions');
    });

    it('injects the personal note only when present', () => {
      const withNote = buildTaskPlanChatPrompt(
        [],
        { ...preferences, note: 'No work on Fridays' },
      );
      expect(withNote).toContain('Personal user instructions: No work on Fridays');
      expect(build()).not.toContain('Personal user instructions:');
    });

    it('injects the existing open tasks as JSON, or (none) when empty', () => {
      expect(build()).toContain(JSON.stringify(openTasks));
      expect(buildTaskPlanChatPrompt([], preferences)).toContain('(none)');
    });

    it('injects availability only when provided and non-empty', () => {
      const availability = { busyDays: ['2026-07-19'] };
      expect(build(availability)).toContain(
        `availability provided by the app: ${JSON.stringify(availability)}`,
      );
      expect(build()).not.toContain('availability provided by the app');
      expect(build({})).not.toContain('availability provided by the app');
    });

    it('keeps the exact response schema and JSON-only output instruction', () => {
      const prompt = build();
      expect(prompt).toContain('Respond with exactly one valid JSON object and nothing else');
      expect(prompt).toContain('"type": "question" | "advice" | "plan"');
      expect(prompt).toContain(
        '"state": "discovery" | "scope_refinement" | "planning" | "review" | "save_ready"',
      );
      expect(prompt).toContain('"understoodSummary"?:');
      expect(prompt).toContain('"relatedSubtaskTitle": string');
      expect(prompt).toContain('"remindAt": string, "type": "time"');
    });
  });

  describe('conversation flow rules', () => {
    it('keeps all five conversation states', () => {
      const prompt = build();
      for (const state of ['discovery', 'scope_refinement', 'planning', 'review', 'save_ready']) {
        expect(prompt).toContain(`"${state}"`);
      }
    });

    it('forbids emitting a plan before explicit confirmation', () => {
      const prompt = build();
      expect(prompt).toContain('never emit type "plan" yet');
      expect(prompt).toContain('Now, and only now, respond with type "plan"');
      expect(prompt).toContain(
        'only produce a structured plan once the user explicitly confirms',
      );
    });

    it('tells the model not to advance state on vague answers', () => {
      const prompt = build();
      expect(prompt).toContain('"ok"');
      expect(prompt).toContain('"I don\'t know"');
      expect(prompt).toContain('do NOT treat it as confirmation or new information');
      expect(prompt).toContain('do NOT advance to the next state');
    });

    it('keeps questions minimal with quick replies', () => {
      const prompt = build();
      expect(prompt).toContain('materially affect the plan');
      expect(prompt).toContain('at most one or two per turn');
      expect(prompt).toContain('2-4 specific quickReplies');
    });

    it('requires replying in the language the user writes in', () => {
      const prompt = build();
      expect(prompt).toContain('Arabic, English, or a mix');
      expect(prompt).toContain('reply in the language the user is writing in');
      expect(prompt).toContain('Arabic input gets an Arabic "message" and Arabic quickReplies');
    });

    it('forbids exposing internal reasoning', () => {
      expect(build()).toContain('never your step-by-step internal reasoning');
    });
  });

  describe('feasibility and risk rules', () => {
    it('requires a required-hours vs available-hours check before any plan', () => {
      const prompt = build();
      expect(prompt).toContain('FEASIBILITY');
      expect(prompt).toContain('Estimate the total hours the goal realistically needs');
      expect(prompt).toContain('time actually available before the deadline');
    });

    it('demands concrete advice instead of a plan when the goal does not fit', () => {
      const prompt = build();
      expect(prompt).toContain('never silently generate the plan anyway');
      expect(prompt).toContain('Respond with type "advice"');
      expect(prompt).toContain('reduce scope, extend the deadline');
    });

    it('classifies goals without forcing a fixed category', () => {
      const prompt = build();
      expect(prompt).toContain('infer a sensible new category');
      expect(prompt).toContain('never force the goal into a wrong one');
    });

    it('asks for domain-aware decomposition rather than templates', () => {
      const prompt = build();
      expect(prompt).toContain('Infer the natural workflow');
      expect(prompt).toContain('software → design/build/test/ship');
      expect(prompt).toContain('study → chapters/concepts/practice/revision/mock exams');
    });

    it('pairs each risk with a mitigation in the review summary', () => {
      expect(build()).toContain('"risk — mitigation"');
    });
  });

  describe('plan construction rules', () => {
    it('encodes deliverables inside subtask descriptions', () => {
      expect(build()).toContain('"description" must state its concrete deliverable');
    });

    it('uses order as dependency-safe execution order', () => {
      const prompt = build();
      expect(prompt).toContain('nothing depends on a later item');
      expect(prompt).toContain('"order" is the dependency-safe execution order');
    });

    it('balances workload across days and keeps deadline slack', () => {
      const prompt = build();
      expect(prompt).toContain('avoid overloading any single day');
      expect(prompt).toContain('leave slack before the deadline');
    });

    it('forbids sessions or reminders in the past', () => {
      const prompt = build();
      expect(prompt).toContain('Never schedule a focus session or reminder in the past');
      expect(prompt).toContain('first session must start after the current date and time');
    });

    it('forbids reminders after the event they support', () => {
      const prompt = build();
      expect(prompt).toContain('Every reminder must fire BEFORE the event it supports');
      expect(prompt).toContain('after that event is useless and must never be produced');
    });

    it('requires splitting long subtasks across multiple focus sessions', () => {
      const prompt = build();
      // workBlockMinutes is 50 in the test fixture.
      expect(prompt).toContain("estimatedMinutes is larger than 50");
      expect(prompt).toContain('split it across MULTIPLE focus sessions');
      expect(prompt).toContain('roughly estimatedMinutes divided by 50, rounded up');
    });

    it('forbids representing long work with a single kickoff session', () => {
      const prompt = build();
      expect(prompt).toContain('Never represent a long subtask with a single short kickoff session');
      expect(prompt).toContain('under-scheduling must not be the default');
    });

    it('allows a shorter final remainder session and defaults sessions to the block size', () => {
      const prompt = build();
      expect(prompt).toContain('Default each focus session to about 50 minutes');
      expect(prompt).toContain('a shorter final session is fine when only a remainder of the work is left');
    });

    it('allows longer sessions only for inherently fixed-duration activities', () => {
      const prompt = build();
      expect(prompt).toContain('Do not make a session substantially longer than 50 minutes');
      expect(prompt).toContain('a timed exam, a fixed meeting, a live event, a full simulation');
    });

    it('represents breaks as gaps between sessions, never as separate items', () => {
      const prompt = build();
      expect(prompt).toContain("the gap between one session's endTime and the next session's startTime");
      expect(prompt).toContain('Never create separate break tasks or break reminders');
    });

    it('does not force non-focus work into focus sessions', () => {
      const prompt = build();
      expect(prompt).toContain('Do NOT force every subtask into a focus session');
      expect(prompt).toContain(
        'errands, waiting, travel, phone calls, appointments, hosting, and physical chores should stay as plain subtasks',
      );
      expect(prompt).toContain('mislabeling it as a focus session is not');
    });

    it('verifies coverage per focus-eligible subtask, not across all subtasks', () => {
      const prompt = build();
      expect(prompt).toContain('verify your own output');
      expect(prompt).toContain(
        'the sum of ITS OWN focus-session minutes reasonably matches ITS estimatedMinutes',
      );
      expect(prompt).toContain('check this per subtask, not across all subtasks');
      expect(prompt).toContain('Repair anything that fails before answering.');
    });
  });
});
