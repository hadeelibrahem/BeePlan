import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { InputField, PrimaryButton } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type {
  ChecklistItem,
  ChecklistReminderTrigger,
  Reminder,
  ReminderFormValues,
  ReminderPriority,
  ReminderType,
  RepeatRule,
} from '../types/reminders.types';
import { ChecklistInput } from './ChecklistInput';
import { ChecklistReminderSection } from './ChecklistReminderSection';
import { DateTimeSection } from './DateTimeSection';
import { LocationReminderFields } from './LocationReminderFields';
import { PrioritySelector } from './PrioritySelector';
import { ReminderTypeSelector } from './ReminderTypeSelector';

const defaultRepeatRule: RepeatRule = { frequency: 'none', interval: 1 };

const createInitialValues = (reminder?: Reminder): ReminderFormValues => ({
  title: reminder?.title ?? '',
  description: reminder?.description ?? '',
  type: reminder?.type ?? 'time',
  priority: reminder?.priority ?? 'medium',
  remindAt: reminder?.remindAt ?? '',
  reminderBeforeMinutes: reminder?.reminderBeforeMinutes ?? 30,
  repeatRule: reminder?.repeatRule ?? defaultRepeatRule,
  location: reminder?.location ?? { mode: 'specific', radiusMeters: 100, triggerType: 'arrive' },
  context: reminder?.context ?? { condition: '', detail: '' },
  checklistItems: reminder?.checklistItems ?? [{ id: 'item-1', title: '', isDone: false }],
  checklistReminderTrigger: reminder?.checklistReminderTrigger ?? {
    time: { type: 'none' },
    location: { type: 'none' },
  },
});

type Props = {
  initialReminder?: Reminder;
  submitLabel: string;
  onSubmit: (values: ReminderFormValues) => Promise<void> | void;
};

export function ReminderForm({ initialReminder, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState<ReminderFormValues>(() => createInitialValues(initialReminder));
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const submitInFlightRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const isValid = useMemo(() => {
    if (!values.title.trim()) return false;
    if (values.type === 'time') return Boolean(values.remindAt?.trim());
    if (values.type === 'location') {
      const location = values.location;
      if (!location) return false;
      if (!location.triggerType) return false;
      if (!(location.radiusMeters > 0)) return false;
      if (location.mode === 'specific') {
        return Boolean(
          location.placeName?.trim() &&
            Number.isFinite(location.latitude) &&
            Number.isFinite(location.longitude),
        );
      }
      if (location.mode === 'category') {
        return Boolean(location.category);
      }
      return false;
    }
    if (values.type === 'context') return Boolean(values.context?.condition.trim());
    if (values.type === 'checklist') {
      if (!values.checklistItems?.some((item) => item.title.trim())) return false;

      const timeTrigger = values.checklistReminderTrigger?.time;
      if (timeTrigger?.type === 'general_time' && !timeTrigger.generalTime?.category) return false;
      if (timeTrigger?.type === 'specific_time') {
        if (!timeTrigger.specificTime?.date?.trim() || !timeTrigger.specificTime?.time?.trim()) return false;
      }

      const locationTrigger = values.checklistReminderTrigger?.location;
      if (locationTrigger?.type === 'general_location' && !locationTrigger.generalLocation?.category) return false;
      if (locationTrigger?.type === 'specific_location') {
        const place = locationTrigger.specificLocation;
        if (!place?.geoapifyPlaceId || !place.placeName?.trim() || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
          return false;
        }
        if (!place.trigger) return false;
      }

      return true;
    }
    return true;
  }, [values]);

  const setType = (type: ReminderType) => setValues((current) => ({ ...current, type }));
  const setPriority = (priority: ReminderPriority) =>
    setValues((current) => ({ ...current, priority }));
  const setRepeatRule = (repeatRule: RepeatRule) =>
    setValues((current) => ({ ...current, repeatRule }));
  const setChecklistItems = (checklistItems: ChecklistItem[]) =>
    setValues((current) => ({ ...current, checklistItems }));
  const setChecklistReminderTrigger = (checklistReminderTrigger: ChecklistReminderTrigger) =>
    setValues((current) => ({ ...current, checklistReminderTrigger }));
  const setLocation = (location: NonNullable<ReminderFormValues['location']>) =>
    setValues((current) => ({ ...current, location }));

  const submit = async () => {
    if (!isValid || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await onSubmit({
        ...values,
        checklistItems: values.checklistItems?.filter((item) => item.title.trim()),
      });
    } catch (error) {
      console.error('[ReminderForm] submit failed:', error);
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const triggerHelp = {
    time: t('reminders.timeHelp'),
    location: t('reminders.locationHelp', { brand_name: t('common.brand_name') }),
    context: t('reminders.contextHelp'),
    checklist: t('reminders.checklistHelp'),
  }[values.type];

  return (
    <View className="gap-6">
      <InputField
        label={t('reminders.title')}
        placeholder={t('reminders.titlePlaceholder', { brand_name: t('common.brand_name') })}
        value={values.title}
        onChangeText={(title) => setValues((current) => ({ ...current, title }))}
      />

      <ReminderTypeSelector value={values.type} onChange={setType} />

      <View className="gap-4">
        <View>
          <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
            {t('reminders.trigger')}
          </Text>
          <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>{triggerHelp}</Text>
        </View>

        {values.type === 'time' && (
          <DateTimeSection
            remindAt={values.remindAt}
            reminderBeforeMinutes={values.reminderBeforeMinutes}
            repeatRule={values.repeatRule ?? defaultRepeatRule}
            onRemindAtChange={(remindAt) => setValues((current) => ({ ...current, remindAt }))}
            onReminderBeforeChange={(reminderBeforeMinutes) =>
              setValues((current) => ({ ...current, reminderBeforeMinutes }))
            }
            onRepeatRuleChange={setRepeatRule}
          />
        )}

        {values.type === 'location' && (
          <LocationReminderFields
            value={values.location ?? { mode: 'specific', radiusMeters: 100, triggerType: 'arrive' }}
            onChange={setLocation}
          />
        )}

        {values.type === 'context' && (
          <View className="gap-4">
            <InputField
              placeholder={t('reminders.contextPlaceholder')}
              value={values.context?.condition ?? ''}
              onChangeText={(condition) =>
                setValues((current) => ({
                  ...current,
                  context: { ...(current.context ?? {}), condition },
                }))
              }
            />
            <InputField
              placeholder={t('reminders.contextDetailPlaceholder')}
              value={values.context?.detail ?? ''}
              onChangeText={(detail) =>
                setValues((current) => ({
                  ...current,
                  context: { ...(current.context ?? { condition: '' }), detail },
                }))
              }
            />
          </View>
        )}

        {values.type === 'checklist' && (
          <View className="gap-4">
            <ChecklistInput value={values.checklistItems ?? []} onChange={setChecklistItems} />
            <ChecklistReminderSection
              value={values.checklistReminderTrigger ?? { time: { type: 'none' }, location: { type: 'none' } }}
              onChange={setChecklistReminderTrigger}
            />
          </View>
        )}
      </View>

      <InputField
        label={t('reminders.notes')}
        placeholder={t('reminders.notesPlaceholder')}
        value={values.description ?? ''}
        onChangeText={(description) => setValues((current) => ({ ...current, description }))}
        multiline
      />

      <PrioritySelector value={values.priority} onChange={setPriority} />

      {!!submitError && <Text className="px-1 text-xs font-semibold" style={{ color: colors.error }}>{submitError}</Text>}

      <PrimaryButton onPress={() => void submit()} disabled={!isValid} loading={isSubmitting} fullWidth>
        {submitLabel}
      </PrimaryButton>
    </View>
  );
}
