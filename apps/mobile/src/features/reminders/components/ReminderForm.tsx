import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type {
  ChecklistItem,
  Reminder,
  ReminderFormValues,
  ReminderPriority,
  ReminderType,
  RepeatRule,
} from '../types/reminders.types';
import { ChecklistInput } from './ChecklistInput';
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
});

type Props = {
  initialReminder?: Reminder;
  submitLabel: string;
  onSubmit: (values: ReminderFormValues) => Promise<void> | void;
};

export function ReminderForm({ initialReminder, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState<ReminderFormValues>(() => createInitialValues(initialReminder));
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      return Boolean(values.checklistItems?.some((item) => item.title.trim()));
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
      <View className="rounded-2xl border px-4 py-3" style={styles.field}>
        <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
          {t('reminders.title')}
        </Text>
        <TextInput
          placeholder={t('reminders.titlePlaceholder', { brand_name: t('common.brand_name') })}
          placeholderTextColor={theme.colors.textSubtle}
          value={values.title}
          onChangeText={(title) => setValues((current) => ({ ...current, title }))}
          className="py-2 text-2xl font-black leading-8"
          style={styles.input}
        />
      </View>

      <ReminderTypeSelector value={values.type} onChange={setType} />

      <View className="gap-4">
        <View>
          <Text className="text-xs font-black uppercase tracking-widest" style={styles.label}>
            {t('reminders.trigger')}
          </Text>
          <Text className="mt-1 text-sm" style={styles.helpText}>{triggerHelp}</Text>
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
            <TextInput
              placeholder={t('reminders.contextPlaceholder')}
              placeholderTextColor={theme.colors.textSubtle}
              value={values.context?.condition}
              onChangeText={(condition) =>
                setValues((current) => ({
                  ...current,
                  context: { ...(current.context ?? {}), condition },
                }))
              }
              className="rounded-2xl border px-4 py-4"
              style={styles.textField}
            />
            <TextInput
              placeholder={t('reminders.contextDetailPlaceholder')}
              placeholderTextColor={theme.colors.textSubtle}
              value={values.context?.detail}
              onChangeText={(detail) =>
                setValues((current) => ({
                  ...current,
                  context: { ...(current.context ?? { condition: '' }), detail },
                }))
              }
              className="rounded-2xl border px-4 py-4"
              style={styles.textField}
            />
          </View>
        )}

        {values.type === 'checklist' && (
          <ChecklistInput value={values.checklistItems ?? []} onChange={setChecklistItems} />
        )}
      </View>

      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={styles.label}>
          {t('reminders.notes')}
        </Text>
        <TextInput
          multiline
          textAlignVertical="top"
          placeholder={t('reminders.notesPlaceholder')}
          placeholderTextColor={theme.colors.textSubtle}
          value={values.description}
          onChangeText={(description) => setValues((current) => ({ ...current, description }))}
          className="min-h-24 rounded-2xl border px-4 py-4 text-base leading-6"
          style={styles.textField}
        />
      </View>

      <PrioritySelector value={values.priority} onChange={setPriority} />

      {!!submitError && (
        <Text className="px-1 text-xs font-semibold" style={styles.errorText}>
          {submitError}
        </Text>
      )}

      <View className="rounded-3xl border p-2" style={styles.submitShell}>
        <Pressable
          disabled={!isValid || isSubmitting}
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isValid || isSubmitting }}
          className="rounded-2xl py-4"
          style={isValid && !isSubmitting ? styles.submitButton : styles.submitButtonDisabled}
        >
          <Text
            className="text-center text-base font-black"
            style={isValid && !isSubmitting ? styles.submitText : styles.submitTextDisabled}
          >
            {isSubmitting ? t('reminders.saving') : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    field: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    label: {
      color: theme.colors.textSubtle,
    },
    helpText: {
      color: theme.colors.textMuted,
    },
    input: {
      color: theme.colors.text,
    },
    textField: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    errorText: {
      color: theme.colors.danger,
    },
    submitShell: {
      backgroundColor: theme.colors.surfaceElevated,
      borderColor: theme.colors.border,
    },
    submitButton: {
      backgroundColor: theme.colors.accent,
    },
    submitButtonDisabled: {
      backgroundColor: theme.colors.disabled,
    },
    submitText: {
      color: theme.colors.accentText,
    },
    submitTextDisabled: {
      color: theme.colors.disabledText,
    },
  });
}
