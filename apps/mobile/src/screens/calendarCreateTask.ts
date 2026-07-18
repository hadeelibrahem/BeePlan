export function createTaskParamsForCalendarDate(selectedDate: string) {
  return { source: 'calendar' as const, initialDueDate: selectedDate }
}
