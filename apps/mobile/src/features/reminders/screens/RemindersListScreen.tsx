import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomNavBar,
  EmptyState,
  FilterTabs,
  FloatingActionButton,
  ScreenLayout,
  SearchInput,
} from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { ReminderCard } from '../components/ReminderCard';
import type { Reminder, ReminderType } from '../types/reminders.types';

type FilterTab = 'all' | ReminderType | 'completed';

type Props = {
  reminders: Reminder[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggle: (id: string) => void;
  onSignOut?: () => void;
  onBack?: () => void;
};

export function RemindersListScreen({ reminders, onSelect, onCreate, onToggle, onSignOut, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const { formatNumber, t } = useLanguage();
  const { theme } = useTheme();

  const tabs: { value: FilterTab; label: string }[] = [
    { value: 'all', label: t('filters.all') },
    { value: 'time', label: t('filters.time') },
    { value: 'location', label: t('filters.location') },
    { value: 'checklist', label: t('filters.checklist') },
    { value: 'context', label: t('filters.context') },
    { value: 'completed', label: t('filters.completed') },
  ];

  const filtered = reminders.filter((reminder) => {
    const matchSearch =
      !search ||
      reminder.title.toLowerCase().includes(search.toLowerCase()) ||
      reminder.description?.toLowerCase().includes(search.toLowerCase());

    const matchTab =
      activeTab === 'all'
        ? reminder.status !== 'done'
        : activeTab === 'completed'
          ? reminder.status === 'done'
          : reminder.type === activeTab && reminder.status !== 'done';

    return matchSearch && matchTab;
  });

  const activeCount = reminders.filter((reminder) => reminder.status === 'active').length;

  return (
    <ScreenLayout
      headerSubtitle={t('dashboard.activeReminders', {
        count: formatNumber(activeCount),
        plural: activeCount === 1 ? '' : 's',
      })}
      onProfilePress={onSignOut}
      fab={<FloatingActionButton onPress={onCreate} aboveNavBar={!!onBack} />}
      footer={onBack ? <BottomNavBar active="reminders" onNavigateDashboard={onBack} /> : undefined}
    >
      {onBack && (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('actions.back')}
          className="mb-4 h-8 w-8 items-center justify-center rounded-full border active:opacity-70"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }}
        >
          <Text className="text-sm font-black" style={{ color: theme.colors.text }}>{'←'}</Text>
        </Pressable>
      )}

      <SearchInput value={search} onChangeText={setSearch} placeholder={t('dashboard.searchPlaceholder')} />

      <FilterTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔔"
          title={search ? t('dashboard.noResults') : t('dashboard.noReminders')}
          description={search ? t('dashboard.tryDifferentSearch') : t('dashboard.createFirstReminder')}
        />
      ) : (
        <View className="gap-3">
          {filtered.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onPress={() => onSelect(reminder.id)}
              onToggle={() => onToggle(reminder.id)}
            />
          ))}
        </View>
      )}
    </ScreenLayout>
  );
}
