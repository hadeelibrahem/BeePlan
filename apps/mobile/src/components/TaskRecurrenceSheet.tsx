import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DangerButton, PrimaryButton, SecondaryButton } from './layout'
import { useTheme } from '../theme/useTheme'
import { parseRecurrenceWithAi, type AiRecurrenceParseResponse } from '../lib/tasksApi'
import { applyAiRecurrence, isUsableAiRecurrence, parseAiRecurrence } from './recurrenceAi'

export type RecurrenceFrequency = 'Never' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom'
export type RecurrenceEndType = 'never' | 'onDate' | 'after'
export type RecurrenceCustomUnit = 'days' | 'weeks' | 'months'
export type RecurrenceMonthlyMode = 'sameDay' | 'lastDay' | 'firstWeekday'

export type RecurrenceSettings = {
  frequency: RecurrenceFrequency
  weekdays: string[]
  monthlyMode: RecurrenceMonthlyMode
  customInterval: number
  customUnit: RecurrenceCustomUnit
  endType: RecurrenceEndType
  endDate: string
  occurrences: number
}

type TaskRecurrenceSheetProps = {
  visible: boolean
  mode: 'create' | 'edit'
  recurrence: RecurrenceSettings | null
  accessToken?: string
  onClose: () => void
  onSave: (recurrence: RecurrenceSettings | null) => void
  onRemove?: () => void
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const frequencies: RecurrenceFrequency[] = ['Never', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Custom']

export const defaultRecurrenceSettings: RecurrenceSettings = {
  frequency: 'Never',
  weekdays: [],
  monthlyMode: 'sameDay',
  customInterval: 1,
  customUnit: 'weeks',
  endType: 'never',
  endDate: '',
  occurrences: 1,
}

export function createRecurrenceSummary(recurrence: RecurrenceSettings | null) {
  if (!recurrence || recurrence.frequency === 'Never') return 'No repeat'

  let summary = ''
  const weekdayText = formatList(recurrence.weekdays)

  if (recurrence.frequency === 'Daily') summary = 'Repeats daily'
  if (recurrence.frequency === 'Weekly') summary = `Repeats every ${weekdayText || 'week'}`
  if (recurrence.frequency === 'Monthly') {
    summary =
      recurrence.monthlyMode === 'lastDay'
        ? 'Repeats on the last day of each month'
        : recurrence.monthlyMode === 'firstWeekday' && weekdayText
          ? `Repeats on the first ${weekdayText} of each month`
          : 'Repeats on the same day every month'
  }
  if (recurrence.frequency === 'Yearly') summary = 'Repeats yearly'
  if (recurrence.frequency === 'Custom') {
    const unit = recurrence.customInterval === 1 ? recurrence.customUnit.replace(/s$/, '') : recurrence.customUnit
    summary = `Repeats every ${recurrence.customInterval} ${unit}`
    if (recurrence.customUnit === 'weeks' && weekdayText) summary += ` on ${weekdayText}`
    if (recurrence.customUnit === 'months' && recurrence.monthlyMode === 'firstWeekday' && weekdayText) {
      summary += ` on the first ${weekdayText}`
    }
  }

  if (recurrence.endType === 'onDate' && recurrence.endDate) summary += ` until ${formatDate(recurrence.endDate)}`
  if (recurrence.endType === 'after') summary += ` for ${recurrence.occurrences} occurrences`

  return summary
}

export function getNextOccurrenceLabel(recurrence: RecurrenceSettings | null) {
  if (!recurrence || recurrence.frequency === 'Never') return 'Not scheduled'
  if (recurrence.frequency === 'Weekly' && recurrence.weekdays.length) return `Next ${recurrence.weekdays[0]}`
  if (recurrence.frequency === 'Daily') return 'Tomorrow'
  if (recurrence.frequency === 'Monthly') return 'Next month'
  if (recurrence.frequency === 'Yearly') return 'Next year'
  return 'Next occurrence'
}

export function TaskRecurrenceSheet({
  visible,
  mode,
  recurrence,
  accessToken,
  onClose,
  onSave,
  onRemove,
}: TaskRecurrenceSheetProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<RecurrenceSettings>(recurrence ?? defaultRecurrenceSettings)
  const [error, setError] = useState('')
  const [aiInput, setAiInput] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [aiResult, setAiResult] = useState<AiRecurrenceParseResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (!visible) return

    setDraft(recurrence ?? defaultRecurrenceSettings)
    setError('')
    setAiInput('')
    setAiContext('')
    setAiMessage('')
    setAiResult(null)
    setAiLoading(false)
  }, [recurrence, visible])

  const preview = useMemo(() => createRecurrenceSummary(draft), [draft])

  const updateDraft = (next: Partial<RecurrenceSettings>) => {
    setDraft((current) => ({ ...current, ...next }))
    setError('')
  }

  const toggleWeekday = (weekday: string) => {
    setDraft((current) => ({
      ...current,
      weekdays:
        (current.frequency === 'Monthly' ||
          (current.frequency === 'Custom' && current.customUnit === 'months')) &&
        current.monthlyMode === 'firstWeekday'
          ? current.weekdays.includes(weekday)
            ? []
            : [weekday]
          : current.weekdays.includes(weekday)
            ? current.weekdays.filter((item) => item !== weekday)
            : [...current.weekdays, weekday],
    }))
    setError('')
  }

  const handleSave = () => {
    const validationError = validateRecurrence(draft)
    if (validationError) {
      setError(validationError)
      return
    }

    onSave(draft.frequency === 'Never' ? null : draft)
    onClose()
  }

  const handleAskAi = async () => {
    if (!accessToken) {
      setAiMessage("I couldn't reach the assistant. You can still set it manually.")
      setAiResult(null)
      return
    }

    setAiLoading(true)
    setAiMessage('')
    setAiResult(null)
    try {
      const result = await parseAiRecurrence(aiInput, (message) => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        return parseRecurrenceWithAi(accessToken, {
          message: aiContext ? `${aiContext}\nUser follow-up: ${message}` : message,
          currentDate: new Date().toISOString(),
          timezone,
        })
      })
      if (!isUsableAiRecurrence(result)) {
        setAiMessage("I couldn't understand that. You can still set it manually.")
        setAiContext('')
      } else if (result.clarifyingQuestion) {
        setAiMessage(result.clarifyingQuestion)
        setAiContext(`User request: ${aiInput.trim()}\nAssistant asked: ${result.clarifyingQuestion}`)
        setAiInput('')
      } else {
        setAiResult(result)
        setAiMessage(`I understood: ${result.preview}`)
        setAiContext('')
        setAiInput('')
      }
    } catch (cause) {
      setAiMessage(cause instanceof Error && cause.message ? cause.message : "I couldn't understand that. Try again or set it manually.")
      setAiResult(null)
    } finally {
      setAiLoading(false)
    }
  }

  const handleApplyAiResult = () => {
    if (!aiResult) return
    const next = applyAiRecurrence(aiResult, draft)
    if (!next) {
      setAiMessage("I couldn't apply that to the recurrence options. You can still set it manually.")
      setAiResult(null)
      return
    }
    setDraft(next)
    setError('')
    setAiMessage(`Applied: ${createRecurrenceSummary(next)}. Review or adjust it, then save.`)
    setAiResult(null)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close recurrence sheet" />

        <View
          className="rounded-t-[28px] border px-5 pt-3"
          style={{
            maxHeight: '90%',
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
            shadowColor: theme.cardShadow.color,
            shadowOpacity: theme.cardShadow.opacity,
            shadowRadius: theme.cardShadow.radius,
            elevation: theme.cardShadow.elevation,
          }}
        >
          <View className="mx-auto mb-5 h-1.5 w-14 rounded-full" style={{ backgroundColor: colors.border }} />

          <View className="mb-5 items-center">
            <Text className="text-2xl font-black" style={{ color: colors.text }}>
              Recurring Task
            </Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              Choose how often this task should repeat.
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <View className="rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-black" style={{ color: colors.text }}>AI Recurrence Assistant</Text>
                  <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>Describe how this task should repeat.</Text>
                </View>
                {aiLoading ? <ActivityIndicator color={colors.accent} accessibilityLabel="Parsing recurrence" /> : null}
              </View>
              <TextInput
                value={aiInput}
                onChangeText={setAiInput}
                editable={!aiLoading}
                placeholder="Every weekday at 9am"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel="Describe recurrence in natural language"
                className="mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold"
                style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
              />
              <PrimaryButton onPress={() => void handleAskAi()} disabled={aiLoading || !aiInput.trim()} className="mt-3" fullWidth>
                {aiLoading ? 'Parsing…' : 'Parse recurrence'}
              </PrimaryButton>
              {aiMessage ? (
                <View className="mt-3 rounded-2xl border p-3" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>{aiMessage}</Text>
                  {aiResult ? <SecondaryButton onPress={handleApplyAiResult} className="mt-3" fullWidth>Apply parsed recurrence</SecondaryButton> : null}
                </View>
              ) : null}
            </View>

            <Text className="mb-3 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
              Repeat
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {frequencies.map((frequency) => (
                <OptionButton
                  key={frequency}
                  selected={draft.frequency === frequency}
                  label={frequency}
                  onPress={() => updateDraft({ frequency })}
                />
              ))}
            </View>

            {draft.frequency === 'Weekly' ||
            (draft.frequency === 'Custom' &&
              (draft.customUnit === 'weeks' ||
                (draft.customUnit === 'months' && draft.monthlyMode === 'firstWeekday'))) ||
            (draft.frequency === 'Monthly' && draft.monthlyMode === 'firstWeekday') ? (
              <View className="mt-5 rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
                <Text className="mb-3 font-black" style={{ color: colors.text }}>
                  Weekdays
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {weekdays.map((weekday) => (
                    <Chip
                      key={weekday}
                      selected={draft.weekdays.includes(weekday)}
                      label={weekday}
                      onPress={() => toggleWeekday(weekday)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {draft.frequency === 'Monthly' || (draft.frequency === 'Custom' && draft.customUnit === 'months') ? (
              <View className="mt-5 rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
                <Text className="mb-3 font-black" style={{ color: colors.text }}>
                  Monthly Options
                </Text>
                <View className="gap-3">
                  <OptionButton
                    selected={draft.monthlyMode === 'sameDay'}
                    label="Same day every month"
                    onPress={() => updateDraft({ monthlyMode: 'sameDay' })}
                    fullWidth
                  />
                  <OptionButton
                    selected={draft.monthlyMode === 'lastDay'}
                    label="Last day of month"
                    onPress={() => updateDraft({ monthlyMode: 'lastDay' })}
                    fullWidth
                  />
                  <OptionButton
                    selected={draft.monthlyMode === 'firstWeekday'}
                    label="First weekday"
                    onPress={() => updateDraft({ monthlyMode: 'firstWeekday' })}
                    fullWidth
                  />
                </View>
              </View>
            ) : null}

            {draft.frequency === 'Custom' ? (
              <View className="mt-5 rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
                <Text className="mb-3 font-black" style={{ color: colors.text }}>
                  Custom Repeat
                </Text>
                <Label text="Repeat every" />
                <TextInput
                  value={String(draft.customInterval)}
                  onChangeText={(value) => updateDraft({ customInterval: Number(value) || 0 })}
                  keyboardType="number-pad"
                  className="mb-3 rounded-2xl border px-4 py-4 font-bold"
                  style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                />
                <Label text="Unit" />
                <View className="flex-row gap-2">
                  {(['days', 'weeks', 'months'] as RecurrenceCustomUnit[]).map((unit) => (
                    <OptionButton
                      key={unit}
                      selected={draft.customUnit === unit}
                      label={unit}
                      onPress={() => updateDraft({ customUnit: unit })}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mt-5 rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
              <Text className="mb-3 font-black" style={{ color: colors.text }}>
                End Condition
              </Text>
              <View className="gap-3">
                <OptionButton selected={draft.endType === 'never'} label="Never ends" onPress={() => updateDraft({ endType: 'never' })} fullWidth />
                <OptionButton selected={draft.endType === 'onDate'} label="Ends on date" onPress={() => updateDraft({ endType: 'onDate' })} fullWidth />
                <OptionButton selected={draft.endType === 'after'} label="Ends after occurrences" onPress={() => updateDraft({ endType: 'after' })} fullWidth />
              </View>

              {draft.endType === 'onDate' ? (
                <View className="mt-4">
                  <Label text="End Date" />
                  <TextInput
                    value={draft.endDate}
                    onChangeText={(value) => updateDraft({ endDate: value })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.placeholder}
                    className="rounded-2xl border px-4 py-4 font-bold"
                    style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                  />
                </View>
              ) : null}

              {draft.endType === 'after' ? (
                <View className="mt-4">
                  <Label text="Occurrences" />
                  <TextInput
                    value={String(draft.occurrences)}
                    onChangeText={(value) => updateDraft({ occurrences: Number(value) || 0 })}
                    keyboardType="number-pad"
                    className="rounded-2xl border px-4 py-4 font-bold"
                    style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                  />
                </View>
              ) : null}
            </View>

            <View className="mt-5 rounded-3xl border p-4" style={{ backgroundColor: colors.accentSoft, borderColor: `${colors.accent}55` }}>
              <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
                Preview
              </Text>
              <Text className="mt-2 font-black" style={{ color: colors.text }}>
                {preview}
              </Text>
            </View>

            {error ? (
              <Text className="mt-4 text-sm font-bold" style={{ color: colors.error }}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View className={`mt-3 ${mode === 'edit' ? 'gap-3' : 'flex-row gap-3'}`}>
            {mode === 'edit' ? (
              <View className="flex-row gap-3">
                <SecondaryButton onPress={onClose} className="flex-1">
                  Cancel
                </SecondaryButton>
                <DangerButton
                  onPress={() => {
                    onRemove?.()
                    onClose()
                  }}
                  className="flex-1"
                >
                  Remove Recurrence
                </DangerButton>
              </View>
            ) : (
              <SecondaryButton onPress={onClose} className="flex-1">
                Cancel
              </SecondaryButton>
            )}
            <PrimaryButton onPress={handleSave} className={mode === 'edit' ? '' : 'flex-1'} fullWidth={mode === 'edit'}>
              {mode === 'edit' ? 'Save Changes' : 'Save Recurrence'}
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function validateRecurrence(recurrence: RecurrenceSettings) {
  if (recurrence.frequency === 'Never') return ''

  if (recurrence.frequency === 'Weekly' && recurrence.weekdays.length === 0) return 'Select at least one weekday.'
  if (recurrence.frequency === 'Monthly' && recurrence.monthlyMode === 'firstWeekday' && recurrence.weekdays.length === 0) {
    return 'Select the weekday for the monthly recurrence.'
  }
  if (recurrence.frequency === 'Custom') {
    if (recurrence.customInterval <= 0) return 'Custom repeat interval must be greater than 0.'
    if (recurrence.customUnit === 'weeks' && recurrence.weekdays.length === 0) return 'Select at least one weekday.'
    if (recurrence.customUnit === 'months' && recurrence.monthlyMode === 'firstWeekday' && recurrence.weekdays.length === 0) {
      return 'Select the weekday for the monthly recurrence.'
    }
  }
  if (recurrence.endType === 'onDate' && !recurrence.endDate) return 'End date is required.'
  if (recurrence.endType === 'after' && recurrence.occurrences <= 0) return 'Occurrences must be greater than 0.'
  return ''
}

function OptionButton({
  selected,
  label,
  onPress,
  fullWidth,
}: {
  selected: boolean
  label: string
  onPress: () => void
  fullWidth?: boolean
}) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`${fullWidth ? 'w-full' : ''} rounded-2xl border px-4 py-3 active:scale-[0.98] active:opacity-90`}
      style={{
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.card,
      }}
    >
      <Text className="text-center text-xs font-black" style={{ color: selected ? colors.accent : colors.text }}>
        {label}
      </Text>
    </Pressable>
  )
}

function Chip({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="rounded-full px-4 py-3 active:scale-[0.98] active:opacity-90"
      style={{ backgroundColor: selected ? colors.accent : colors.card }}
    >
      <Text className="text-xs font-black" style={{ color: selected ? colors.accentText : colors.text }}>
        {label}
      </Text>
    </Pressable>
  )
}

function Label({ text }: { text: string }) {
  const { theme } = useTheme()
  return (
    <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  )
}

function formatList(values: string[]) {
  if (!values.length) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}
