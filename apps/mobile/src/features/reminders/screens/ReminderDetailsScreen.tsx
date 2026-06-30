import { Text, View } from 'react-native';
import { AppScreen, PageHeader, PrimaryButton, SectionCard } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { Reminder } from '../types/reminders.types';
import { getLocationLabel } from '../utils/locationLabel';

type Props = {
  reminder: Reminder;
  onBack: () => void;
  onEdit: () => void;
};

export function ReminderDetailsScreen({ reminder, onBack, onEdit }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <AppScreen>
      <PageHeader
        title={t('reminders.typeReminder', { type: t(`filters.${reminder.type}`) })}
        onBack={onBack}
        actions={
          <PrimaryButton onPress={onEdit} className="px-5 py-3">
            {t('actions.edit')}
          </PrimaryButton>
        }
      />

      <SectionCard>
        <Text className="text-3xl font-black" style={{ color: colors.text }}>{reminder.title}</Text>
        {!!reminder.description && (
          <Text className="mt-3 text-base leading-7" style={{ color: colors.secondaryText }}>{reminder.description}</Text>
        )}
        <View className="mt-6 gap-3">
          <Detail label={t('reminders.detailStatus')} value={t(`status.${reminder.status}`)} />
          <Detail label={t('reminders.detailPriority')} value={reminder.priority} />
          {reminder.remindAt && <Detail label={t('reminders.detailWhen')} value={reminder.remindAt} />}
          {reminder.location && (
            <Detail
              label={t('reminders.detailLocation')}
              value={`${reminder.location.triggerType} ${getLocationLabel(reminder.location)}, ${reminder.location.radiusMeters}m`}
            />
          )}
          {reminder.context && <Detail label={t('reminders.detailCondition')} value={reminder.context.condition} />}
        </View>
      </SectionCard>

      {!!reminder.checklistItems?.length && (
        <SectionCard className="mt-5">
          <Text className="mb-4 text-lg font-black" style={{ color: colors.text }}>{t('reminders.checklist')}</Text>
          <View className="gap-3">
            {reminder.checklistItems.map((item) => (
              <View key={item.id} className="flex-row items-center gap-3">
                <View
                  className={`h-5 w-5 rounded-full ${item.isDone ? '' : 'border'}`}
                  style={{ backgroundColor: item.isDone ? colors.accent : 'transparent', borderColor: colors.secondaryText }}
                />
                <Text className="flex-1 text-sm font-semibold" style={{ color: colors.secondaryText }}>{item.title}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      )}
    </AppScreen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}
