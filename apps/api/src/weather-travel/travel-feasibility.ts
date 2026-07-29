import type { TravelFeasibilityConflict } from '../ai/planner/planner.types';
import type { RouteEstimate } from './weather-travel.types';
export function travelFeasibilityConflict(
  previous: { id: string; title: string; endTime: string },
  current: { id: string; title: string; startTime: string },
  route: RouteEstimate,
): TravelFeasibilityConflict | null {
  const available = minutes(current.startTime) - minutes(previous.endTime);
  if (available >= route.durationMinutes) return null;
  return {
    type: 'travel_feasibility_conflict',
    affectedItem: { id: current.id, title: current.title },
    conflictingItem: { id: previous.id, title: previous.title },
    requiredTravelDurationMinutes: route.durationMinutes,
    requiredDeparture: label(
      minutes(current.startTime) - route.durationMinutes,
    ),
    availableGapMinutes: Math.max(0, available),
    suggestedValidAlternative: `${label(minutes(previous.endTime) + route.durationMinutes)} or later`,
    fallbackUsed: route.fallbackUsed,
  };
}
const minutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const label = (value: number) =>
  `${String(Math.floor(Math.max(0, value) / 60)).padStart(2, '0')}:${String(Math.max(0, value) % 60).padStart(2, '0')}`;
