import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { RepeatRule } from '../types/reminders.types';
import { RepeatSelector } from './RepeatSelector';

type Props = {
  remindAt?: string;
  reminderBeforeMinutes?: number;
  repeatRule: RepeatRule;
  onRemindAtChange: (value: string) => void;
  onReminderBeforeChange: (value: number) => void;
  onRepeatRuleChange: (value: RepeatRule) => void;
};

type IosStep = 'date' | 'time';

function formatRemindAt(remindAt: string | undefined, locale: string): string | null {
  if (!remindAt) return null;

  const date = new Date(remindAt);
  if (!Number.isFinite(date.getTime())) return null;

  const datePart = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  return `${datePart} • ${timePart}`;
}

function combineDateAndTime(datePart: Date, timePart: Date): Date {
  const combined = new Date(datePart);
  combined.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return combined;
}

export function DateTimeSection({
  remindAt,
  reminderBeforeMinutes,
  repeatRule,
  onRemindAtChange,
  onReminderBeforeChange,
  onRepeatRuleChange,
}: Props) {
  const { theme } = useTheme();
  const { language, t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [pastDateError, setPastDateError] = useState(false);
  const [iosModalVisible, setIosModalVisible] = useState(false);
  const [iosStep, setIosStep] = useState<IosStep>('date');
  const [iosPendingDate, setIosPendingDate] = useState<Date>(() => new Date());

  const locale = language === 'ar' ? 'ar' : 'en-US';
  const displayValue = formatRemindAt(remindAt, locale);
  const initialValue = remindAt && Number.isFinite(new Date(remindAt).getTime()) ? new Date(remindAt) : new Date();

  const commitDateTime = (candidate: Date) => {
    if (candidate.getTime() <= Date.now()) {
      setPastDateError(true);
      return;
    }

    setPastDateError(false);
    onRemindAtChange(candidate.toISOString());
  };

  const openPicker = () => {
    setPastDateError(false);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialValue,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (dateEvent: DateTimePickerEvent, selectedDate?: Date) => {
          if (dateEvent.type !== 'set' || !selectedDate) return;

          DateTimePickerAndroid.open({
            value: selectedDate,
            mode: 'time',
            is24Hour: false,
            onChange: (timeEvent: DateTimePickerEvent, selectedTime?: Date) => {
              if (timeEvent.type !== 'set' || !selectedTime) return;
              commitDateTime(combineDateAndTime(selectedDate, selectedTime));
            },
          });
        },
      });
      return;
    }

    setIosPendingDate(initialValue);
    setIosStep('date');
    setIosModalVisible(true);
  };

  const handleIosDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type !== 'set' || !selectedDate) return;
    setIosPendingDate(selectedDate);
    setIosStep('time');
  };

  const handleIosTimeChange = (_event: DateTimePickerEvent, selectedTime?: Date) => {
    if (!selectedTime) return;
    setIosPendingDate((current) => combineDateAndTime(current, selectedTime));
  };

  const confirmIosTime = () => {
    setIosModalVisible(false);
    commitDateTime(iosPendingDate);
  };

  const cancelIosPicker = () => setIosModalVisible(false);

  return (
    <View className="gap-4">
      <View>
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={t('reminders.dateTime')}
          className="rounded-2xl border px-4 py-3"
          style={styles.field}
        >
          <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
            {t('reminders.dateTime')}
          </Text>
          <TextInput
            editable={false}
            pointerEvents="none"
            placeholder={t('reminders.selectDateTimePlaceholder')}
            placeholderTextColor={theme.colors.textSubtle}
            value={displayValue ?? ''}
            className="py-2 text-base font-semibold"
            style={styles.input}
          />
        </Pressable>
        {pastDateError && (
          <Text className="mt-1 px-1 text-xs font-semibold" style={styles.errorText}>
            {t('reminders.pastDateTimeError')}
          </Text>
        )}
      </View>

      <View className="rounded-2xl border px-4 py-3" style={styles.field}>
        <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
          {t('reminders.reminderBefore')}
        </Text>
        <TextInput
          keyboardType="numeric"
          placeholder="30 minutes"
          placeholderTextColor={theme.colors.textSubtle}
          value={reminderBeforeMinutes ? String(reminderBeforeMinutes) : ''}
          onChangeText={(text) => onReminderBeforeChange(Number(text) || 0)}
          className="py-2 text-base font-semibold"
          style={styles.input}
        />
      </View>
      <RepeatSelector value={repeatRule} onChange={onRepeatRuleChange} />

      {Platform.OS !== 'android' && (
        <Modal visible={iosModalVisible} transparent animationType="fade" onRequestClose={cancelIosPicker}>
          <View className="flex-1 items-center justify-center px-6" style={styles.modalOverlay}>
            <View className="w-full rounded-3xl border p-4" style={styles.modalCard}>
              {iosStep === 'date' ? (
                <DateTimePicker
                  value={iosPendingDate}
                  mode="date"
                  display="inline"
                  minimumDate={new Date()}
                  themeVariant={theme.mode}
                  accentColor={theme.colors.accent}
                  onChange={handleIosDateChange}
                />
              ) : (
                <>
                  <DateTimePicker
                    value={iosPendingDate}
                    mode="time"
                    display="spinner"
                    themeVariant={theme.mode}
                    accentColor={theme.colors.accent}
                    onChange={handleIosTimeChange}
                  />
                  <View className="mt-2 flex-row justify-end gap-2">
                    <Pressable onPress={cancelIosPicker} className="rounded-full px-4 py-2.5" style={styles.modalSecondaryButton}>
                      <Text className="text-sm font-black" style={styles.text}>{t('reminders.pickerCancel')}</Text>
                    </Pressable>
                    <Pressable onPress={confirmIosTime} className="rounded-full px-4 py-2.5" style={styles.modalPrimaryButton}>
                      <Text className="text-sm font-black" style={styles.modalPrimaryButtonText}>
                        {t('reminders.pickerDone')}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      )}
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
    input: {
      color: theme.colors.text,
    },
    text: {
      color: theme.colors.text,
    },
    errorText: {
      color: theme.colors.danger,
    },
    modalOverlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalCard: {
      backgroundColor: theme.colors.surfaceElevated,
      borderColor: theme.colors.border,
    },
    modalSecondaryButton: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    modalPrimaryButton: {
      backgroundColor: theme.colors.accent,
    },
    modalPrimaryButtonText: {
      color: theme.colors.accentText,
    },
  });
}
