export type TaskScheduleDraft = {
  scheduledDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  estimatedTimeMinutes?: number
}

export const INCOMPLETE_SCHEDULE_MESSAGE = 'Add an end time or estimated duration for this scheduled task.'

export function taskScheduleValidationError(draft: TaskScheduleDraft) {
  const hasScheduleFields = Boolean(draft.scheduledDate || draft.scheduledStartTime || draft.scheduledEndTime)
  if (hasScheduleFields && (!draft.scheduledDate || !draft.scheduledStartTime)) return 'Scheduled date and start time are required together.'
  if (draft.scheduledDate && draft.scheduledStartTime && !draft.scheduledEndTime && !(draft.estimatedTimeMinutes && draft.estimatedTimeMinutes > 0)) return INCOMPLETE_SCHEDULE_MESSAGE
  return ''
}

export function canValidateTaskSchedule(draft: TaskScheduleDraft) {
  return Boolean(draft.scheduledDate && draft.scheduledStartTime && (draft.scheduledEndTime || (draft.estimatedTimeMinutes && draft.estimatedTimeMinutes > 0)))
}
