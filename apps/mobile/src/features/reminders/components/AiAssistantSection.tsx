import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import { OutlineButton, PrimaryButton, SectionCard } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { parsePersonReminder } from '../../social/api/social.api';
import type { ParsePersonReminderResult } from '../../social/types/social.types';
import { createVoiceReminderDraft, inferSmartLocation, parseReminderText, type SmartLocationSuggestion } from '../api/reminders.api';
import type { AiAssistantMode, AiAssistantState, ReminderDraft } from '../types/aiAssistant.types';
import type { GeneralLocationCategory } from '../types/reminders.types';
import { getSmartLocationSummary } from '../utils/aiDraftMapping';
import {
  CONFIDENCE_TIER_EMOJI,
  getCategoryEmoji,
  getCategoryLabel,
  getConfidenceTier,
  SMART_LOCATION_CATEGORIES,
} from '../utils/smartLocationCategories';
import { PlaceTypeAutocomplete } from './PlaceTypeAutocomplete';

export type ApplyDraftOptions = {
  categoryOverride?: GeneralLocationCategory;
  disableSmartLocation?: boolean;
  radius?: number;
  confidence?: number;
  reason?: string;
};

type Props = {
  onApplyDraft: (draft: ReminderDraft, options?: ApplyDraftOptions) => void;
  onApplyPersonDraft: (result: ParsePersonReminderResult) => void;
  accessToken: string;
};

// Above this, a parse-person-reminder result is routed to the Person form.
const PERSON_CONFIDENCE_THRESHOLD = 0.5;

// Module-level so the AI prompt survives navigating to People (to add a missing
// friend) and back — there's no sessionStorage in React Native.
let persistedAiText = '';

export function clearAiReminderText() {
  persistedAiText = '';
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function friendlyErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/transcribe|speech|audio file|no speech/i.test(message)) return 'reminders.aiAssistant.errorUpload';
  if (/parse|ai returned|gemini|ai service/i.test(message)) return 'reminders.aiAssistant.errorAiUnavailable';
  if (!message) return 'reminders.aiAssistant.errorUnderstand';
  return '';
}

function buildSummaryLines(draft: ReminderDraft, t: Translate): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];

  if (draft.reminderType === 'time') {
    const parts = [draft.time.date, draft.time.time].filter(Boolean);
    if (parts.length) {
      const repeatSuffix = draft.time.repeat !== 'none' ? ` (${draft.time.repeat})` : '';
      lines.push({ label: t('reminders.aiAssistant.summaryWhen'), value: `${parts.join(' ')}${repeatSuffix}` });
    }
  }

  if (draft.reminderType === 'location') {
    const parts = [draft.location.name, draft.location.category].filter(Boolean);
    if (parts.length) {
      lines.push({ label: t('reminders.aiAssistant.summaryWhere'), value: `${parts.join(' · ')} (${draft.location.trigger})` });
    }
  }

  if (draft.reminderType === 'context' && draft.context.condition) {
    lines.push({ label: t('reminders.aiAssistant.summaryCondition'), value: draft.context.condition });
  }

  if (draft.reminderType === 'checklist' && draft.checklist.length) {
    lines.push({ label: t('reminders.aiAssistant.summaryItems'), value: draft.checklist.join(', ') });
  }

  return lines;
}

export function AiAssistantSection({ onApplyDraft, onApplyPersonDraft, accessToken }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  const [mode, setMode] = useState<AiAssistantMode>('text');
  const [state, setState] = useState<AiAssistantState>('idle');
  const [text, setTextState] = useState(persistedAiText);
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<ReminderDraft | null>(null);
  const [personResult, setPersonResult] = useState<ParsePersonReminderResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [categoryOverride, setCategoryOverride] = useState<GeneralLocationCategory | undefined>(undefined);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [inference, setInference] = useState<SmartLocationSuggestion | null>(null);
  const [inferenceLoading, setInferenceLoading] = useState(false);

  const setText = (value: string) => {
    persistedAiText = value;
    setTextState(value);
  };

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const applyPulse = useRef(new Animated.Value(1)).current;

  const busy = state === 'uploading' || state === 'processing' || recorderState.isRecording;

  const reset = () => {
    setState('idle');
    setDraft(null);
    setPersonResult(null);
    setTranscript('');
    setErrorMessage('');
    setCategoryOverride(undefined);
    setShowCategoryPicker(false);
    setInference(null);
    setInferenceLoading(false);
  };

  /**
   * Runs the real AI/rules smart-location inference (same engine ReminderForm's
   * inline suggestion uses) against the source text, so category/confidence/reason
   * on the card reflect an actual computed result instead of a fixed default.
   */
  const refreshInference = async (nextDraft: ReminderDraft, sourceText: string) => {
    setInference(null);
    const eligible = nextDraft.reminderType === 'location' && nextDraft.location.mode === 'general';
    if (!eligible || !sourceText.trim()) return;

    setInferenceLoading(true);
    try {
      const result = await inferSmartLocation(sourceText, accessToken);
      setInference(result);
    } catch (error) {
      console.error('[AiAssistantSection] smart location inference failed:', error);
    } finally {
      setInferenceLoading(false);
    }
  };

  const showError = (error: unknown) => {
    const key = friendlyErrorKey(error);
    setErrorMessage(key ? t(key) : error instanceof Error ? error.message : t('reminders.aiAssistant.errorUnderstand'));
    setState('error');
  };

  // Person detection runs first: when parse-person-reminder confidently
  // identifies a person reminder we skip the generic parser and route to the
  // Person form. Otherwise fall back to the standard draft mapping.
  const handleFillWithAi = async () => {
    if (!text.trim() || busy) return;
    setErrorMessage('');
    setState('processing');
    try {
      const sourceText = text.trim();
      const person = await parsePersonReminder(sourceText);
      if (person.isPersonReminder && person.confidence >= PERSON_CONFIDENCE_THRESHOLD) {
        setTranscript('');
        setDraft(null);
        setPersonResult(person);
        setState('draft_ready');
        return;
      }
      const result = await parseReminderText(sourceText, accessToken);
      setTranscript('');
      setPersonResult(null);
      setDraft(result);
      setCategoryOverride(undefined);
      setShowCategoryPicker(false);
      setState('draft_ready');
      void refreshInference(result, sourceText);
    } catch (error) {
      showError(error);
    }
  };

  const startRecording = async () => {
    setErrorMessage('');
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setErrorMessage(t('reminders.aiAssistant.errorMicPermission'));
        setState('error');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
    } catch (error) {
      showError(error);
    }
  };

  const stopRecording = async () => {
    setState('uploading');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Recording failed.');
      const result = await createVoiceReminderDraft({ uri, name: 'recording.m4a', type: 'audio/m4a' }, accessToken);
      setTranscript(result.transcript);
      // Re-check the transcript for person intent so voice and text produce the
      // same analysis. Falls back to the generic draft on any failure.
      try {
        const person = await parsePersonReminder(result.transcript);
        if (person.isPersonReminder && person.confidence >= PERSON_CONFIDENCE_THRESHOLD) {
          setDraft(null);
          setPersonResult(person);
          setState('draft_ready');
          return;
        }
      } catch {
        // best-effort — keep the generic draft
      }
      setPersonResult(null);
      setDraft(result.draft);
      setCategoryOverride(undefined);
      setShowCategoryPicker(false);
      setState('draft_ready');
      void refreshInference(result.draft, result.transcript);
    } catch (error) {
      showError(error);
    }
  };

  const summaryLines = draft ? buildSummaryLines(draft, t) : [];

  const inferredCategory =
    inference?.category && (SMART_LOCATION_CATEGORIES as string[]).includes(inference.category)
      ? inference.category
      : undefined;
  const overrideReason = categoryOverride
    ? t('reminders.aiAssistant.userSelectedReason', { category: getCategoryLabel(categoryOverride, t) })
    : undefined;

  const smartSummary = draft
    ? getSmartLocationSummary(draft, {
        category: categoryOverride ?? inferredCategory,
        confidence: categoryOverride ? 1 : inference?.confidence,
        reason: categoryOverride ? overrideReason : inference?.reason,
      })
    : null;
  const confidenceTier = smartSummary ? getConfidenceTier(smartSummary.confidence) : null;

  useEffect(() => {
    if (state !== 'draft_ready') return;
    cardOpacity.setValue(0);
    Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [state, cardOpacity]);

  useEffect(() => {
    if (state !== 'draft_ready' || !smartSummary || confidenceTier === 'low') return;
    applyPulse.setValue(1);
    Animated.sequence([
      Animated.timing(applyPulse, { toValue: 1.05, duration: 250, useNativeDriver: true }),
      Animated.timing(applyPulse, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(applyPulse, { toValue: 1.05, duration: 250, useNativeDriver: true }),
      Animated.timing(applyPulse, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [state, draft, confidenceTier, applyPulse]);

  return (
    <SectionCard className="mb-6">
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.aiAssistant.title')}
      </Text>
      <Text className="mb-4 mt-1 text-sm" style={{ color: colors.secondaryText }}>
        {t('reminders.aiAssistant.subtitle')}
      </Text>

      <View
        className="mb-4 flex-row gap-2 rounded-2xl border p-1.5"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        {(['text', 'voice'] as AiAssistantMode[]).map((option) => {
          const selected = mode === option;
          return (
            <Pressable
              key={option}
              onPress={() => {
                setMode(option);
                reset();
              }}
              disabled={busy}
              className="flex-1 items-center rounded-xl px-3 py-2.5"
              style={{
                borderWidth: selected ? 1 : 0,
                borderColor: colors.accent,
                backgroundColor: selected ? colors.accentSoft : 'transparent',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text className="text-sm font-black" style={{ color: colors.text }}>
                {t(option === 'text' ? 'reminders.aiAssistant.modeText' : 'reminders.aiAssistant.modeVoice')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'text' && (
        <View className="gap-3">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('reminders.aiAssistant.textPlaceholder')}
            placeholderTextColor={colors.placeholder}
            editable={!busy}
            multiline
            className="min-h-24 rounded-2xl border px-4 py-3 text-base"
            style={{ backgroundColor: colors.input, color: colors.text, borderColor: colors.border, textAlignVertical: 'top' }}
          />
          <PrimaryButton onPress={() => void handleFillWithAi()} disabled={!text.trim() || busy} loading={state === 'processing'} fullWidth>
            {t('reminders.aiAssistant.fillWithAi')}
          </PrimaryButton>
        </View>
      )}

      {mode === 'voice' && (
        <View className="gap-3">
          {!recorderState.isRecording ? (
            <PrimaryButton onPress={() => void startRecording()} disabled={state === 'uploading' || state === 'processing'} fullWidth>
              {t('reminders.aiAssistant.startRecording')}
            </PrimaryButton>
          ) : (
            <PrimaryButton onPress={() => void stopRecording()} fullWidth>
              {t('reminders.aiAssistant.stopRecording')}
            </PrimaryButton>
          )}
          {recorderState.isRecording && (
            <Text className="text-xs font-black" style={{ color: colors.accent }}>
              {t('reminders.aiAssistant.recording')}
            </Text>
          )}
          {state === 'uploading' && (
            <Text className="text-xs font-semibold" style={{ color: colors.secondaryText }}>
              {t('reminders.aiAssistant.uploading')}
            </Text>
          )}
        </View>
      )}

      {state === 'processing' && mode === 'text' && (
        <Text className="mt-3 text-xs font-semibold" style={{ color: colors.secondaryText }}>
          {t('reminders.aiAssistant.processing')}
        </Text>
      )}

      {state === 'error' && !!errorMessage && (
        <Text className="mt-3 text-xs font-semibold" style={{ color: colors.error }}>
          {errorMessage}
        </Text>
      )}

      {state === 'draft_ready' && personResult && (
        <View className="mt-4 gap-3 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
          {!!transcript && (
            <View>
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.aiAssistant.transcript')}
              </Text>
              <Text className="mt-1 text-sm" style={{ color: colors.text }}>{transcript}</Text>
            </View>
          )}
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.aiAssistant.detectedType')}
            </Text>
            <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>{t('reminders.typePerson')}</Text>
          </View>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.title')}
            </Text>
            <Text className="mt-1 text-sm" style={{ color: colors.text }}>
              {personResult.draft.title || personResult.draft.person.message || t('reminders.person.defaultTitle')}
            </Text>
          </View>
          <View>
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.person.friend')}
            </Text>
            <Text className="mt-1 text-sm" style={{ color: colors.text }}>
              {personResult.matchedFriendName || personResult.draft.person.personName || t('reminders.person.notMatched')}
            </Text>
          </View>
          <View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.person.confidence')}
              </Text>
              <Text className="text-xs font-black" style={{ color: colors.accent }}>{Math.round(personResult.confidence * 100)}%</Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.border }}>
              <View className="h-full rounded-full" style={{ width: `${Math.round(personResult.confidence * 100)}%`, backgroundColor: colors.accent }} />
            </View>
          </View>
          <View className="mt-2 flex-row gap-2">
            <View className="flex-1">
              <PrimaryButton onPress={() => onApplyPersonDraft(personResult)} fullWidth>
                {t('reminders.aiAssistant.applyToForm')}
              </PrimaryButton>
            </View>
            <View className="flex-1">
              <OutlineButton onPress={reset} fullWidth>
                {t('reminders.aiAssistant.clear')}
              </OutlineButton>
            </View>
          </View>
        </View>
      )}

      {state === 'draft_ready' && draft && (
        <Animated.View
          className="mt-4 gap-3 rounded-2xl border p-4"
          style={{ borderColor: colors.border, backgroundColor: colors.background, opacity: cardOpacity }}
        >
          {!!transcript && (
            <View>
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.aiAssistant.transcript')}
              </Text>
              <Text className="mt-1 text-sm" style={{ color: colors.text }}>
                {transcript}
              </Text>
            </View>
          )}

          <View>
            <Text className="text-sm font-black" style={{ color: colors.text }}>
              {smartSummary ? t('reminders.aiAssistant.smartLocationTitle') : `🤖 ${t('reminders.aiAssistant.title')}`}
            </Text>
            <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
              {t('reminders.aiAssistant.understood')}
            </Text>
            {!!smartSummary && (
              <Text className="mt-1 text-sm font-semibold" style={{ color: colors.text }}>
                {t(
                  smartSummary.trigger === 'leave'
                    ? 'reminders.aiAssistant.triggerSentenceLeave'
                    : 'reminders.aiAssistant.triggerSentenceArrive',
                  { category: getCategoryLabel(smartSummary.category, t) },
                )}
              </Text>
            )}
          </View>

          {!!draft.title && (
            <View>
              <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.title')}
              </Text>
              <Text className="mt-1 text-sm" style={{ color: colors.text }}>
                {draft.title}
              </Text>
            </View>
          )}

          {inferenceLoading && !categoryOverride && !!smartSummary && (
            <Text className="text-xs font-semibold" style={{ color: colors.secondaryText }}>
              {t('reminders.aiAssistant.analyzingCategory')}
            </Text>
          )}

          {smartSummary ? (
            <>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                    {getCategoryEmoji(smartSummary.category)} {t('reminders.aiAssistant.categoryLabel')}
                  </Text>
                  <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                    {getCategoryLabel(smartSummary.category, t)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                    📍 {t('reminders.aiAssistant.triggerLabel')}
                  </Text>
                  <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                    {t(
                      smartSummary.trigger === 'leave'
                        ? 'reminders.aiAssistant.triggerWhenLeaving'
                        : 'reminders.aiAssistant.triggerWhenArriving',
                    )}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                    📏 {t('reminders.aiAssistant.radiusLabel')}
                  </Text>
                  <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                    {t('reminders.aiAssistant.radiusValue', { radius: smartSummary.radius })}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                    🎯 {t('reminders.aiAssistant.confidenceLabel')}
                  </Text>
                  <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
                    {CONFIDENCE_TIER_EMOJI[confidenceTier!]} {Math.round(smartSummary.confidence * 100)}%
                  </Text>
                </View>
              </View>

              <View>
                <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                  💡 {t('reminders.aiAssistant.reasonLabel')}
                </Text>
                <Text className="mt-1 text-sm leading-6" style={{ color: colors.secondaryText }}>
                  {smartSummary.reason}
                </Text>
              </View>

              {confidenceTier === 'low' && (
                <View className="rounded-xl border px-3 py-2" style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}>
                  <Text className="text-xs font-semibold" style={{ color: colors.text }}>
                    {t('reminders.aiAssistant.lowConfidenceHint')}
                  </Text>
                </View>
              )}

              {showCategoryPicker && (
                <PlaceTypeAutocomplete
                  value={categoryOverride ?? smartSummary.category}
                  onChange={setCategoryOverride}
                  onCustomLabelChange={() => undefined}
                />
              )}

              <View className="flex-row flex-wrap gap-2">
                <Animated.View style={{ transform: [{ scale: applyPulse }] }}>
                  <PrimaryButton
                    onPress={() =>
                      onApplyDraft(draft, {
                        categoryOverride: smartSummary.category,
                        radius: smartSummary.radius,
                        confidence: smartSummary.confidence,
                        reason: smartSummary.reason,
                      })
                    }
                  >
                    {t('reminders.aiAssistant.apply')}
                  </PrimaryButton>
                </Animated.View>
                <OutlineButton
                  onPress={() => setShowCategoryPicker((open) => !open)}
                  style={confidenceTier === 'low' ? { borderColor: colors.accent, borderWidth: 2 } : undefined}
                >
                  {t('reminders.aiAssistant.changeCategory')}
                </OutlineButton>
                <OutlineButton
                  onPress={() => onApplyDraft(draft, { categoryOverride: smartSummary.category, disableSmartLocation: true })}
                >
                  {t('reminders.aiAssistant.disableSmartLocation')}
                </OutlineButton>
              </View>
              <Pressable onPress={reset}>
                <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
                  {t('reminders.aiAssistant.startOver')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {summaryLines.map((line) => (
                <View key={line.label}>
                  <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                    {line.label}
                  </Text>
                  <Text className="mt-1 text-sm" style={{ color: colors.text }}>
                    {line.value}
                  </Text>
                </View>
              ))}
              <View className="mt-2 flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton onPress={() => onApplyDraft(draft)} fullWidth>
                    {t('reminders.aiAssistant.applyToForm')}
                  </PrimaryButton>
                </View>
                <View className="flex-1">
                  <OutlineButton onPress={reset} fullWidth>
                    {t('reminders.aiAssistant.clear')}
                  </OutlineButton>
                </View>
              </View>
            </>
          )}
        </Animated.View>
      )}
    </SectionCard>
  );
}
