import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomNavBar, EmptyState, FilterTabs, FloatingActionButton, MobileIcon, ScreenLayout, SearchInput } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { ReminderCard } from '../components/ReminderCard';
import type { Reminder, ReminderType } from '../types/reminders.types';

type FilterTab = 'all' | ReminderType | 'completed';
type Props = { reminders: Reminder[]; onSelect: (id: string) => void; onCreate: () => void; onToggle: (id: string) => void; onSignOut?: () => void; onBack?: () => void; onViewPeople?: () => void; onRefresh?: () => Promise<void> | void };

export function RemindersListScreen({ reminders, onSelect, onCreate, onToggle, onSignOut, onBack, onViewPeople, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { formatNumber, t } = useLanguage();
  const { theme } = useTheme();
  async function refresh() { if (refreshing || !onRefresh) return; setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }
  const tabs: { value: FilterTab; label: string }[] = [{ value: 'all', label: t('filters.all') }, { value: 'time', label: t('filters.time') }, { value: 'location', label: t('filters.location') }, { value: 'person', label: 'People' }, { value: 'checklist', label: t('filters.checklist') }, { value: 'context', label: t('filters.context') }, { value: 'completed', label: t('filters.completed') }];
  const filtered = reminders.filter((reminder) => (!search || reminder.title.toLowerCase().includes(search.toLowerCase()) || reminder.description?.toLowerCase().includes(search.toLowerCase())) && (activeTab === 'all' ? reminder.status !== 'done' : activeTab === 'completed' ? reminder.status === 'done' : reminder.type === activeTab && reminder.status !== 'done'));
  const activeCount = reminders.filter((reminder) => reminder.status === 'active').length;
  return <ScreenLayout headerSubtitle={t('dashboard.activeReminders', { count: formatNumber(activeCount), plural: activeCount === 1 ? '' : 's' })} onSignOut={onSignOut} refreshing={refreshing} onRefresh={onRefresh ? () => void refresh() : undefined} fab={<FloatingActionButton onPress={onCreate} aboveNavBar={!!onBack} />} footer={onBack ? <BottomNavBar active="reminders" onNavigateDashboard={onBack} /> : undefined}>
    {onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('actions.back')} className="mb-3 h-8 w-8 items-center justify-center rounded-full border active:opacity-70" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }}><MobileIcon name="focus" color={theme.colors.text} size={16} accessibilityLabel={t('actions.back')} /></Pressable> : null}
    {onViewPeople ? <Pressable onPress={onViewPeople} accessibilityRole="button" accessibilityLabel="People and proximity reminders" className="mb-3 flex-row items-center justify-between rounded-2xl border px-4 py-3 active:opacity-80" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}><View className="flex-row items-center gap-2"><MobileIcon name="people" color={theme.colors.text} size={18} /><Text className="text-sm font-bold" style={{ color: theme.colors.text }}>People & proximity reminders</Text></View><MobileIcon name="focus" color={theme.colors.accent} size={16} /></Pressable> : null}
    <SearchInput value={search} onChangeText={setSearch} placeholder={t('dashboard.searchPlaceholder')} /><FilterTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
    {activeTab === 'person' && onViewPeople ? <Pressable onPress={onViewPeople} accessibilityRole="button" accessibilityLabel="Create Person Reminder" className="mb-3 flex-row items-center justify-center gap-2 rounded-2xl border px-4 py-3 active:opacity-80" style={{ borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft }}><MobileIcon name="people" color={theme.colors.accent} size={18} /><Text className="text-sm font-bold" style={{ color: theme.colors.accent }}>Create Person Reminder</Text></Pressable> : null}
    {filtered.length === 0 ? activeTab === 'person' ? <EmptyState icon="people" title="No person reminders yet" description="Create one to be reminded when someone is nearby." /> : <EmptyState icon="reminders" title={search ? t('dashboard.noResults') : t('dashboard.noReminders')} description={search ? t('dashboard.tryDifferentSearch') : t('dashboard.createFirstReminder')} /> : <View className="gap-2">{filtered.map((reminder) => <ReminderCard key={reminder.id} reminder={reminder} onPress={() => onSelect(reminder.id)} onToggle={() => onToggle(reminder.id)} />)}</View>}
  </ScreenLayout>;
}
