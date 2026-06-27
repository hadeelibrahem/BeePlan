import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BeePlanLogo from '../../../components/BeePlanLogo';
import { useLanguage } from '../../../i18n/LanguageContext';
import { LanguageToggle } from '../../../i18n/LanguageToggle';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import { ReminderCard } from '../components/ReminderCard';
import type { Reminder, ReminderType } from '../types/reminders.types';

type FilterTab = 'all' | ReminderType | 'completed';

type Props = {
  reminders: Reminder[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggle: (id: string) => void;
  onSignOut?: () => void;
};

export function RemindersListScreen({ reminders, onSelect, onCreate, onToggle, onSignOut }: Props) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const { theme, toggleTheme } = useTheme();
  const { formatNumber, t } = useLanguage();
  const themed = useMemo(() => createStyles(theme), [theme]);
  const topInset = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  const bottomInset = Platform.OS === 'ios' ? 20 : 12;

  const tabs: FilterTab[] = ['all', 'time', 'location', 'checklist', 'context', 'completed'];

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
    <SafeAreaView style={[themed.safeArea, Platform.OS === 'android' && { paddingTop: topInset }]}>
      <View style={themed.headerContainer}>
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <View className="mb-0.5 flex-row items-center gap-2">
              <BeePlanLogo size={28} iconOnly />
              <Text className="text-xl font-bold tracking-tight" style={themed.title}>
                {t('common.brand_name')}
              </Text>
            </View>
            <Text className="text-xs" style={themed.subtleText}>
              {t('dashboard.activeReminders', {
                count: formatNumber(activeCount),
                plural: activeCount === 1 ? '' : 's',
              })}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <LanguageToggle />
            <Pressable
              onPress={toggleTheme}
              accessibilityRole="switch"
              accessibilityState={{ checked: theme.mode === 'light' }}
              accessibilityLabel={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={themed.iconButton}
            >
              <Text className="text-base font-black" style={themed.iconButtonText}>
                {theme.mode === 'light' ? '\u2600' : '\u263e'}
              </Text>
            </Pressable>
            {onSignOut && (
              <Pressable
                onPress={onSignOut}
                accessibilityRole="button"
                accessibilityLabel={t('actions.userProfile')}
                className="h-10 w-10 items-center justify-center rounded-full"
                style={themed.iconButton}
              >
                <Text className="text-sm font-black" style={themed.iconButtonText}>
                  F
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View className="flex-row items-center rounded-2xl px-3" style={themed.searchBox}>
          <View className="h-4 w-4 items-center justify-center">
            <View className="h-3 w-3 rounded-full border-2" style={themed.searchIconCircle} />
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('dashboard.searchPlaceholder')}
            placeholderTextColor={theme.colors.textSubtle}
            className="flex-1 py-3 text-sm"
            style={themed.input}
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} className="px-1">
              <Text className="text-sm font-black" style={themed.subtleText}>X</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-11"
        style={themed.tabsStrip}
        contentContainerClassName="px-5 pb-3"
      >
        <View className="flex-row gap-1 rounded-full p-1" style={themed.tabsContainer}>
          {tabs.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className="rounded-full px-3.5 py-1.5"
              style={activeTab === tab && themed.activeTab}
            >
              <Text
                className={`text-xs ${activeTab === tab ? 'font-semibold' : 'font-medium'}`}
                style={activeTab === tab ? themed.activeTabText : themed.subtleText}
              >
                {t(`filters.${tab}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-24">
        {filtered.length === 0 ? (
          <View className="items-center justify-center gap-4 py-16">
            <View className="h-16 w-16 items-center justify-center rounded-2xl" style={themed.emptyIcon}>
              <Text className="text-xl font-black" style={themed.activeTabText}>B</Text>
            </View>
            <View className="items-center">
              <Text className="mb-1 text-sm font-semibold" style={themed.title}>
                {search ? t('dashboard.noResults') : t('dashboard.noReminders')}
              </Text>
              <Text className="text-xs" style={themed.subtleText}>
                {search ? t('dashboard.tryDifferentSearch') : t('dashboard.createFirstReminder')}
              </Text>
            </View>
          </View>
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
      </ScrollView>

      <View style={[themed.fabContainer, { bottom: 24 + bottomInset }]}>
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel={t('actions.newReminder')}
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: theme.colors.accent,
            shadowColor: theme.colors.accent,
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: 0.24,
            shadowRadius: 18,
          }}
        >
          <Text className="text-3xl font-black leading-none" style={themed.accentText}>+</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
    position: 'relative',
  },
  headerContainer: {
    backgroundColor: theme.colors.background,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    color: theme.colors.text,
  },
  subtleText: {
    color: theme.colors.textSubtle,
  },
  iconButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  iconButtonText: {
    color: theme.colors.icon,
  },
  searchBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  searchIconCircle: {
    borderColor: theme.colors.textSubtle,
  },
  input: {
    color: theme.colors.text,
  },
  tabsStrip: {
    backgroundColor: theme.colors.background,
  },
  tabsContainer: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  activeTab: {
    backgroundColor: theme.colors.accentSoft,
  },
  activeTabText: {
    color: theme.colors.accent,
  },
  emptyIcon: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  accentText: {
    color: theme.colors.accentText,
  },
  fabContainer: {
    position: 'absolute',
    end: 20,
  },
  });
}
