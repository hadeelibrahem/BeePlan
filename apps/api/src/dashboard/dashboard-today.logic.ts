export type TodayWorkUnit = {
  dueAt: Date | null;
  status: string;
  estimatedMinutes: number;
  spentMinutes: number;
  completed: boolean;
};

export function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function progressForToday(units: TodayWorkUnit[], focusMinutes: number) {
  const eligible = units.filter((unit) => unit.dueAt !== null);
  const completedWorkUnits = eligible.filter((unit) => unit.completed).length;
  const totalWorkUnits = eligible.length;
  const remainingEstimatedMinutes = eligible.reduce(
    (total, unit) =>
      total + Math.max(0, unit.estimatedMinutes - unit.spentMinutes),
    0,
  );
  return {
    percent:
      totalWorkUnits === 0
        ? 0
        : Math.round((completedWorkUnits / totalWorkUnits) * 100),
    completedWorkUnits,
    totalWorkUnits,
    focusMinutes,
    remainingEstimatedMinutes,
    basis: 'eligible tasks and subtasks due today',
  };
}

export function dailyStatusFor(input: {
  totalWorkUnits: number;
  completedWorkUnits: number;
  overdueCount: number;
  remainingEstimatedMinutes: number;
  capacityMinutes: number | null;
}) {
  if (input.totalWorkUnits > 0 && input.completedWorkUnits === input.totalWorkUnits) {
    return { status: 'Day complete', statusTone: 'success' as const };
  }
  if (
    input.overdueCount > 0 ||
    (input.capacityMinutes !== null && input.remainingEstimatedMinutes > input.capacityMinutes)
  ) {
    return { status: 'At risk', statusTone: 'danger' as const };
  }
  if (input.completedWorkUnits > 0 || input.totalWorkUnits === 0) {
    return { status: 'On track', statusTone: 'positive' as const };
  }
  return { status: 'Slightly behind', statusTone: 'warning' as const };
}
