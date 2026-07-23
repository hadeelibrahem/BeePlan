import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { InputField, PrimaryButton } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { inferSmartLocation, type SmartLocationSuggestion } from '../api/reminders.api';
import type { FriendSummary } from '../../social/types/social.types';
import type {
  ChecklistItem,
  ChecklistReminderTrigger,
  GeneralLocationCategory,
  PersonReminderConfig,
  Reminder,
  ReminderFormValues,
  ReminderPriority,
  ReminderType,
  RepeatRule,
} from '../types/reminders.types';
import {
  CONFIDENCE_TIER_EMOJI,
  DEFAULT_UNKNOWN_CONFIDENCE,
  getCategoryDefaultRadius,
  getCategoryEmoji,
  getCategoryLabel,
  getConfidenceTier,
} from '../utils/smartLocationCategories';
import { ChecklistInput } from './ChecklistInput';
import { ChecklistReminderSection } from './ChecklistReminderSection';
import { DateTimeSection } from './DateTimeSection';
import { LocationReminderFields } from './LocationReminderFields';
import { PersonReminderFields } from './PersonReminderFields';
import { PlaceTypeAutocomplete } from './PlaceTypeAutocomplete';
import { PrioritySelector } from './PrioritySelector';
import { ReminderTypeSelector } from './ReminderTypeSelector';

const defaultRepeatRule: RepeatRule = { frequency: 'none', interval: 1 };

const defaultPerson: PersonReminderConfig = {
  radiusMeters: 100,
  cooldownMinutes: 30,
  expiration: '1w',
};

const createInitialValues = (reminder?: Reminder): ReminderFormValues => ({
  title: reminder?.title ?? '',
  description: reminder?.description ?? '',
  type: reminder?.type ?? 'time',
  priority: reminder?.priority ?? 'medium',
  remindAt: reminder?.remindAt ?? '',
  reminderBeforeMinutes: reminder?.reminderBeforeMinutes ?? 30,
  repeatRule: reminder?.repeatRule ?? defaultRepeatRule,
  location: reminder?.location ?? { mode: 'specific_place', radiusMeters: 100, trigger: 'arrive' },
  context: reminder?.context ?? { condition: '', detail: '' },
  checklistItems: reminder?.checklistItems ?? [{ id: 'item-1', title: '', isDone: false }],
  checklistReminderTrigger: reminder?.checklistReminderTrigger ?? {
    time: { type: 'none' },
    location: { type: 'none' },
  },
  person: reminder?.person ?? defaultPerson,
  smartLocationEnabled: reminder?.smartLocationEnabled ?? false,
  smartPlaceCategory: reminder?.smartPlaceCategory,
  triggerRadius: reminder?.triggerRadius ?? 200,
  triggerOnEnter: reminder?.triggerOnEnter ?? true,
  triggerCooldown: reminder?.triggerCooldown ?? 1440,
  lastTriggeredAt: reminder?.lastTriggeredAt,
  smartLocationReason: reminder?.smartLocationReason,
  smartLocationConfidence: reminder?.smartLocationConfidence,
});

type Props = {
  initialReminder?: Reminder;
  accessToken?: string;
  submitLabel: string;
  onSubmit: (values: ReminderFormValues) => Promise<void> | void;
  /** Accepted friends, needed for the Person reminder friend selector. */
  friends?: FriendSummary[];
  /** Called from the Person fields when the user wants to add a friend. */
  onAddFriend?: () => void;
};

export function ReminderForm({
  initialReminder,
  accessToken,
  submitLabel,
  onSubmit,
  friends = [],
  onAddFriend,
}: Props) {
  const [values, setValues] = useState<ReminderFormValues>(() => createInitialValues(initialReminder));
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const submitInFlightRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [smartSuggestion, setSmartSuggestion] = useState<SmartLocationSuggestion | null>(null);
  const [dismissedSmartText, setDismissedSmartText] = useState('');
  const [isSmartPickerOpen, setIsSmartPickerOpen] = useState(false);
  const [isActiveSmartPickerOpen, setIsActiveSmartPickerOpen] = useState(false);
  const [manualSmartCategory, setManualSmartCategory] = useState<GeneralLocationCategory | undefined>(undefined);
  // Nothing populates this yet — it's the wiring point for a future live Geoapify
  // nearby-search (geoapifyPlacesService.searchNearbyPlacesByCategory) keyed off the
  // device's current position and `activeSmartCategory`/`activeRadius` below. Until
  // that's wired in, the card honestly shows "searching" rather than a fabricated
  // place/distance — swap in the setter once live location lands.
  const [nearestPlace] = useState<{ name: string; distanceMeters: number } | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const text = values.title.trim();
    if (text.length < 3 || values.smartLocationEnabled || dismissedSmartText === text) {
      setSmartSuggestion(null);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      inferSmartLocation(text, accessToken)
        .then((suggestion) => {
          if (cancelled) return;
          if (!suggestion.category || suggestion.confidence < 0.55) {
            setSmartSuggestion(null);
            return;
          }
          setSmartSuggestion(suggestion);
          setManualSmartCategory(suggestion.category);
          setIsSmartPickerOpen(false);
        })
        .catch((error: unknown) => {
          console.error('[ReminderForm] smart location suggestion failed:', error);
        });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [accessToken, dismissedSmartText, values.smartLocationEnabled, values.title]);

  const isValid = useMemo(() => {
    if (!values.title.trim()) return false;
    if (values.type === 'time') return Boolean(values.remindAt?.trim());
    if (values.type === 'location') {
      const location = values.location;
      if (!location) return false;
      if (!location.trigger) return false;
      if (!(location.radiusMeters > 0)) return false;
      if (location.mode === 'specific_place') {
        const place = location.specificPlace;
        // A search result or a resolved map/current-location pin is valid;
        // raw manual text without geocoding never produces a `selectedBy`.
        return Boolean(place?.selectedBy && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
      }
      if (location.mode === 'general_category') {
        const category = location.generalCategory?.category;
        if (!category) return false;
        if (category === 'custom') return Boolean(location.generalCategory?.customLabel?.trim());
        return true;
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
      if (locationTrigger?.type === 'general_location') {
        const category = locationTrigger.generalLocation?.category;
        if (!category) return false;
        if (category === 'custom' && !locationTrigger.generalLocation?.customLabel?.trim()) return false;
      }
      if (locationTrigger?.type === 'specific_location') {
        const place = locationTrigger.specificLocation;
        // A search result or a resolved map/current-location pin is valid;
        // raw manual text without geocoding never produces a `selectedBy`.
        if (!place?.selectedBy || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
          return false;
        }
        if (!place.trigger) return false;
      }

      return true;
    }
    if (values.type === 'person') {
      return Boolean(values.person?.targetUserId);
    }
    return true;
  }, [values]);

  const setType = (type: ReminderType) => setValues((current) => ({ ...current, type }));
  const setPerson = (person: PersonReminderConfig) => setValues((current) => ({ ...current, person }));
  const setPriority = (priority: ReminderPriority) =>
    setValues((current) => ({ ...current, priority }));
  const setRepeatRule = (repeatRule: RepeatRule) =>
    setValues((current) => ({ ...current, repeatRule }));
  const setChecklistItems = (checklistItems: ChecklistItem[]) =>
    setValues((current) => ({ ...current, checklistItems }));
  const setChecklistReminderTrigger = (checklistReminderTrigger: ChecklistReminderTrigger) =>
    setValues((current) => ({ ...current, checklistReminderTrigger }));
  // `triggerRadius`/`triggerOnEnter` drive the AI Smart Location card and the
  // saved smart-location monitoring fields; `location.radiusMeters`/`location.trigger`
  // drive the generic location UI (LocationReminderFields). Once smart location is
  // enabled, keep them mirrored so editing the radius pill or arrive/leave toggle is
  // reflected immediately instead of going stale.
  const setLocation = (location: NonNullable<ReminderFormValues['location']>) =>
    setValues((current) => ({
      ...current,
      location,
      ...(current.smartLocationEnabled
        ? { triggerRadius: location.radiusMeters, triggerOnEnter: location.trigger !== 'leave' }
        : null),
    }));

  const applySmartLocation = (category: GeneralLocationCategory) => {
    const radius = getCategoryDefaultRadius(category);
    setValues((current) => ({
      ...current,
      title: smartSuggestion?.title || current.title,
      type: 'location',
      location: {
        mode: 'general_category',
        generalCategory: { category },
        trigger: 'arrive',
        radiusMeters: radius,
      },
      smartLocationEnabled: true,
      smartPlaceCategory: category,
      triggerRadius: radius,
      triggerOnEnter: true,
      triggerCooldown: 1440,
      smartLocationReason: smartSuggestion?.reason,
      smartLocationConfidence: smartSuggestion?.confidence,
    }));
    setSmartSuggestion(null);
    setIsSmartPickerOpen(false);
  };

  const disableSmartLocation = () => {
    setDismissedSmartText(values.title.trim());
    setSmartSuggestion(null);
    setIsSmartPickerOpen(false);
    setValues((current) => ({
      ...current,
      smartLocationEnabled: false,
      smartPlaceCategory: undefined,
      smartLocationReason: undefined,
      smartLocationConfidence: undefined,
    }));
  };

  const changeActiveSmartCategory = (category: GeneralLocationCategory) => {
    setValues((current) => {
      const trigger = current.location?.trigger ?? 'arrive';
      const radius = current.location?.radiusMeters ?? getCategoryDefaultRadius(category);
      return {
        ...current,
        type: 'location',
        location: { mode: 'general_category', generalCategory: { category }, trigger, radiusMeters: radius },
        smartLocationEnabled: true,
        smartPlaceCategory: category,
        triggerRadius: radius,
        triggerOnEnter: trigger !== 'leave',
        // The category just changed, so any previously computed reason/confidence
        // no longer applies — this is a direct user choice, not an AI/rules guess.
        smartLocationReason: t('reminders.aiAssistant.userSelectedReason', { category: getCategoryLabel(category, t) }),
        smartLocationConfidence: 1,
      };
    });
  };

  const activeSmartCategory = values.smartPlaceCategory ?? values.location?.generalCategory?.category;
  const smartReason =
    values.smartLocationReason ??
    (activeSmartCategory ? `This reminder triggers when you're near ${getCategoryLabel(activeSmartCategory, t)}.` : '');
  const smartConfidenceRatio = values.smartLocationConfidence ?? DEFAULT_UNKNOWN_CONFIDENCE;
  const smartConfidence = Math.round(smartConfidenceRatio * 100);
  const smartConfidenceTier = getConfidenceTier(smartConfidenceRatio);
  const activeTrigger = values.location?.trigger ?? 'arrive';
  const triggerLabel = activeTrigger === 'leave' ? 'When leaving' : 'When arriving nearby';
  const activeRadius = values.triggerRadius ?? (activeSmartCategory ? getCategoryDefaultRadius(activeSmartCategory) : undefined);

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
    person: t('reminders.personHelp'),
  }[values.type];

  return (
    <View className="gap-4">
      <InputField
        label={t('reminders.title')}
        placeholder={t('reminders.titlePlaceholder', { brand_name: t('common.brand_name') })}
        value={values.title}
        onChangeText={(title) => setValues((current) => ({ ...current, title }))}
      />

      {smartSuggestion?.category && (
        <View className="gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              AI Suggestion
            </Text>
            <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
              BeePlan thinks this reminder should trigger near:
            </Text>
          </View>
          <Text className="text-lg font-black" style={{ color: colors.text }}>
            {getCategoryEmoji(manualSmartCategory ?? smartSuggestion.category)}{' '}
            {t(`reminders.generalLocationCategory.${manualSmartCategory ?? smartSuggestion.category}`)}
          </Text>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              💡 Reason
            </Text>
            <Text className="mt-1 text-sm leading-6" style={{ color: colors.secondaryText }}>
              {smartSuggestion.reason}
            </Text>
          </View>
          {isSmartPickerOpen && (
            <PlaceTypeAutocomplete
              value={manualSmartCategory}
              onChange={setManualSmartCategory}
              onCustomLabelChange={() => undefined}
            />
          )}
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => applySmartLocation(manualSmartCategory ?? smartSuggestion.category!)}
              className="rounded-full px-4 py-2 active:opacity-80"
              style={{ backgroundColor: colors.accent }}
            >
              <Text className="text-xs font-black" style={{ color: colors.accentText }}>
                ✅ Accept
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsSmartPickerOpen((open) => !open)}
              className="rounded-full border px-4 py-2 active:opacity-80"
              style={{ borderColor: colors.border, backgroundColor: colors.input }}
            >
              <Text className="text-xs font-black" style={{ color: colors.text }}>
                ✏️ Change Category
              </Text>
            </Pressable>
            <Pressable
              onPress={disableSmartLocation}
              className="rounded-full border px-4 py-2 active:opacity-80"
              style={{ borderColor: colors.border }}
            >
              <Text className="text-xs font-black" style={{ color: colors.secondaryText }}>
                ❌ Disable Smart Location
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {values.smartLocationEnabled && activeSmartCategory && (
        <View className="gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}>
          <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
            🤖 AI Smart Location
          </Text>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {getCategoryEmoji(activeSmartCategory)} Category
            </Text>
            <Text className="mt-1 text-lg font-black" style={{ color: colors.text }}>
              {getCategoryEmoji(activeSmartCategory)} {t(`reminders.generalLocationCategory.${activeSmartCategory}`)}
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                📏 Radius
              </Text>
              <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                {activeRadius} m
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                📍 Trigger
              </Text>
              <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                {triggerLabel}
              </Text>
            </View>
          </View>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              💡 Reason
            </Text>
            <Text className="mt-1 text-sm leading-6" style={{ color: colors.secondaryText }}>
              {smartReason}
            </Text>
          </View>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              🎯 Confidence
            </Text>
            <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
              {CONFIDENCE_TIER_EMOJI[smartConfidenceTier]} {smartConfidence}%
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                📡 Nearest {getCategoryLabel(activeSmartCategory, t)}
              </Text>
              <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                {nearestPlace ? nearestPlace.name : t('reminders.aiAssistant.searchingNearbyPlaces')}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                📏 Distance
              </Text>
              <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                {nearestPlace ? `${nearestPlace.distanceMeters} m` : '—'}
              </Text>
            </View>
          </View>
          {isActiveSmartPickerOpen && (
            <PlaceTypeAutocomplete
              value={activeSmartCategory}
              onChange={changeActiveSmartCategory}
              onCustomLabelChange={() => undefined}
            />
          )}
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => setIsActiveSmartPickerOpen((open) => !open)}
              className="rounded-full border px-4 py-2 active:opacity-80"
              style={{
                borderColor: smartConfidenceTier === 'low' ? colors.accent : colors.border,
                borderWidth: smartConfidenceTier === 'low' ? 2 : 1,
                backgroundColor: colors.input,
              }}
            >
              <Text className="text-xs font-black" style={{ color: colors.text }}>
                ✏️ Change Category
              </Text>
            </Pressable>
            <Pressable
              onPress={disableSmartLocation}
              className="rounded-full border px-4 py-2 active:opacity-80"
              style={{ borderColor: colors.border }}
            >
              <Text className="text-xs font-black" style={{ color: colors.secondaryText }}>
                ❌ Disable Smart Location
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <ReminderTypeSelector value={values.type} onChange={setType} />

      <View className="gap-3">
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
            value={values.location ?? { mode: 'specific_place', radiusMeters: 100, trigger: 'arrive' }}
            onChange={setLocation}
          />
        )}

        {values.type === 'context' && (
          <View className="gap-3">
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
          <View className="gap-3">
            <ChecklistInput value={values.checklistItems ?? []} onChange={setChecklistItems} />
            <ChecklistReminderSection
              value={values.checklistReminderTrigger ?? { time: { type: 'none' }, location: { type: 'none' } }}
              onChange={setChecklistReminderTrigger}
            />
          </View>
        )}

        {values.type === 'person' && (
          <PersonReminderFields
            value={values.person ?? defaultPerson}
            onChange={setPerson}
            friends={friends}
            onAddFriend={onAddFriend}
          />
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
