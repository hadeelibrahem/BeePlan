// Measurable impact + text alignment.
//
// Two jobs, both about making a card's words match the engines:
//
//  1. `impactOf` turns the shared simulation's deltas into the ONLY impact the
//     card shows — real before/after values for the metrics that actually move.
//     Vague prose ("evens out utilisation") is no longer the impact claim.
//
//  2. `alignTextWithForecast` rewrites the quantitative parts of a detector's
//     stored text using the deterministic engines. The detectors are heuristics
//     (deadline risk assumes a flat 2h/member/day); their prose therefore cannot
//     be trusted to agree with the Resource-Aware Forecast. Restating the number
//     from the forecast is what makes "card says 8 days late / preview says 0"
//     structurally impossible rather than merely unlikely.
//
// Pure and IO-free.

import type { DeltaDirection, DeltaUnit, PreviewDelta, PreviewSnapshot } from './recommendation-preview.logic';

export type ImpactMetric = {
  key: string;
  label: string;
  unit: DeltaUnit;
  before: number | null;
  after: number | null;
  direction: DeltaDirection;
};

export type RecommendationImpact = {
  /** Only metrics that actually change — never a row of "no change". */
  metrics: ImpactMetric[];
  /** Projected completion shift, present only when the date really moves. */
  forecastDateBefore: string | null;
  forecastDateAfter: string | null;
  /** One plain sentence naming the biggest effects. */
  summary: string;
};

function minutesLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function amountLabel(delta: PreviewDelta): string {
  const size = Math.abs(delta.change ?? 0);
  switch (delta.unit) {
    case 'days':
      return `${size} day${size === 1 ? '' : 's'}`;
    case 'minutes':
      return minutesLabel(size);
    case 'points':
      return `${size} point${size === 1 ? '' : 's'}`;
    case 'percent':
      return `${size}%`;
    default:
      return `${size} item${size === 1 ? '' : 's'}`;
  }
}

/**
 * The card's impact block. Built from the SAME deltas the preview renders, so a
 * card and its preview cannot disagree.
 */
export function impactOf(input: {
  deltas: PreviewDelta[];
  baseline: PreviewSnapshot;
  projected: PreviewSnapshot;
}): RecommendationImpact {
  const moved = input.deltas.filter((delta) => delta.direction !== 'unchanged');

  const dateMoved =
    input.baseline.forecast.projectedCompletion !== input.projected.forecast.projectedCompletion;

  const phrases = moved
    .slice(0, 3)
    .map(
      (delta) =>
        `${delta.label.toLowerCase()} ${delta.direction === 'better' ? 'improves' : 'worsens'} by ${amountLabel(delta)}`,
    );

  return {
    metrics: moved.map((delta) => ({
      key: delta.key,
      label: delta.label,
      unit: delta.unit,
      before: delta.before,
      after: delta.after,
      direction: delta.direction,
    })),
    forecastDateBefore: dateMoved ? input.baseline.forecast.projectedCompletion : null,
    forecastDateAfter: dateMoved ? input.projected.forecast.projectedCompletion : null,
    summary: phrases.length
      ? `Approving this ${phrases.join(', and ')}.`
      : 'Approving this changes no tracked project metric.',
  };
}

// --- Text alignment ---------------------------------------------------------

export type AlignedText = { title: string; message: string; reason: string };

function dayLabel(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Restate a recommendation's quantitative claims from the deterministic engines.
 *
 * Only the numbers the detector guessed at are replaced; the item and member
 * names it chose are preserved, because those come from real rows. A kind whose
 * text makes no quantitative claim is returned untouched.
 */
export function alignTextWithForecast(input: {
  kind: string;
  title: string;
  message: string;
  reason: string;
  baseline: PreviewSnapshot;
}): AlignedText {
  const { kind, title, message, baseline } = input;

  if (kind === 'deadline_risk') {
    const { delayDays, capacityShortfallMinutes, unscheduledItemCount } = baseline.forecast;
    // The detector's own "~N days late" came from a flat throughput guess; the
    // forecast knows each member's real availability, so it wins.
    const alignedTitle =
      delayDays > 0
        ? `Deadline risk — the forecast finishes ${dayLabel(delayDays)} late`
        : capacityShortfallMinutes > 0
          ? `Deadline risk — ${minutesLabel(capacityShortfallMinutes)} of work has no room in the schedule`
          : `Deadline risk — ${unscheduledItemCount} item${unscheduledItemCount === 1 ? '' : 's'} cannot be scheduled`;

    const alignedReason =
      delayDays > 0
        ? `The resource-aware forecast projects completion ${dayLabel(delayDays)} past the deadline.`
        : capacityShortfallMinutes > 0
          ? `The forecast cannot fit ${minutesLabel(capacityShortfallMinutes)} of remaining work into the team's available time.`
          : `The forecast cannot place ${unscheduledItemCount} item${unscheduledItemCount === 1 ? '' : 's'} at all.`;

    return { title: alignedTitle, message, reason: alignedReason };
  }

  if (kind === 'workload_imbalance') {
    const { overloadedCount, balancePercent } = baseline.capacity;
    const alignedReason =
      overloadedCount > 0
        ? `${overloadedCount} member${overloadedCount === 1 ? ' is' : 's are'} over capacity, with team workload balance at ${balancePercent}%.`
        : `Team workload balance is ${balancePercent}%, below the level at which work is considered evenly spread.`;
    return { title, message, reason: alignedReason };
  }

  // ahead_of_pace / inactive_member make activity claims, not schedule claims —
  // the detector's own reason is already the deterministic truth for those.
  return { title, message, reason: input.reason };
}
