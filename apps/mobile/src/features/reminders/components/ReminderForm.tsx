import { useMemo, useState } from 'react';
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
  TriggerType,
} from '../types/reminders.types';
import { ChecklistInput } from './ChecklistInput';
import { DateTimeSection } from './DateTimeSection';
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
  location: reminder?.location ?? { name: '', radiusMeters: 100, triggerType: 'arrive' },
  context: reminder?.context ?? { condition: '', detail: '' },
  checklistItems: reminder?.checklistItems ?? [{ id: 'item-1', title: '', isDone: false }],
});

type Props = {
  initialReminder?: Reminder;
  submitLabel: string;
  onSubmit: (values: ReminderFormValues) => void;
};

export function ReminderForm({ initialReminder, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState<ReminderFormValues>(() => createInitialValues(initialReminder));
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const isValid = useMemo(() => {
    if (!values.title.trim()) return false;
    if (values.type === 'time') return Boolean(values.remindAt?.trim());
    if (values.type === 'location') return Boolean(values.location?.name.trim());
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
  const setTriggerType = (triggerType: TriggerType) =>
    setValues((current) => ({
      ...current,
      location: { ...(current.location ?? { name: '', radiusMeters: 100 }), triggerType },
    }));

  const submit = () => {
    if (!isValid) return;
    onSubmit({
      ...values,
      checklistItems: values.checklistItems?.filter((item) => item.title.trim()),
    });
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
          <View className="gap-4">
            <View className="rounded-2xl border px-4 py-3" style={styles.field}>
              <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
                {t('reminders.locationName')}
              </Text>
              <TextInput
                placeholder={t('reminders.locationPlaceholder')}
                placeholderTextColor={theme.colors.textSubtle}
                value={values.location?.name}
                onChangeText={(name) =>
                  setValues((current) => ({
                    ...current,
                    location: { ...(current.location ?? { radiusMeters: 100, triggerType: 'arrive' }), name },
                  }))
                }
                className="py-2 text-base font-semibold"
                style={styles.input}
              />
            </View>
            <View className="rounded-2xl border px-4 py-3" style={styles.field}>
              <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
                {t('reminders.radiusMeters')}
              </Text>
              <TextInput
                keyboardType="numeric"
                value={String(values.location?.radiusMeters ?? 100)}
                onChangeText={(text) =>
                  setValues((current) => ({
                    ...current,
                    location: {
                      ...(current.location ?? { name: '', triggerType: 'arrive' }),
                      radiusMeters: Number(text) || 100,
                    },
                  }))
                }
                className="py-2 text-base font-semibold"
                style={styles.input}
              />
            </View>
            <View className="flex-row gap-2">
              {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => {
                const selected = values.location?.triggerType === triggerType;
                return (
                  <Pressable
                    key={triggerType}
                    onPress={() => setTriggerType(triggerType)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className="flex-1 rounded-full border px-4 py-3"
                    style={selected ? styles.selectedPill : styles.pill}
                  >
                    <Text
                      className="text-center text-xs font-black capitalize"
                      style={selected ? styles.selectedText : styles.input}
                    >
                      {t(`reminders.${triggerType}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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

      <View className="rounded-3xl border p-2" style={styles.submitShell}>
        <Pressable
          disabled={!isValid}
          onPress={submit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isValid }}
          className="rounded-2xl py-4"
          style={isValid ? styles.submitButton : styles.submitButtonDisabled}
        >
          <Text
            className="text-center text-base font-black"
            style={isValid ? styles.submitText : styles.submitTextDisabled}
          >
            {submitLabel}
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
    pill: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    selectedPill: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    selectedText: {
      color: theme.colors.accent,
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
