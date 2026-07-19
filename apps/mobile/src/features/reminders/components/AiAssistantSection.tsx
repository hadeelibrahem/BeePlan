import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { OutlineButton, PrimaryButton, SectionCard } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { parsePersonReminder } from '../../social/api/social.api';
import type { ParsePersonReminderResult } from '../../social/types/social.types';
import { createVoiceReminderDraft, parseReminderText } from '../api/reminders.api';
import type { AiAssistantMode, AiAssistantState, ReminderDraft } from '../types/aiAssistant.types';

type Props = {
  onApplyDraft: (draft: ReminderDraft) => void;
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

const TYPE_LABEL_KEYS: Record<ReminderDraft['reminderType'], string> = {
  time: 'reminders.typeTime',
  location: 'reminders.typeLocation',
  context: 'reminders.typeContext',
  checklist: 'reminders.typeChecklist',
  // The standard AI assistant never emits 'person' (person reminders are
  // created via the AI-first People flow), but ReminderType includes it.
  person: 'reminders.typePerson',
};

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

  const setText = (value: string) => {
    persistedAiText = value;
    setTextState(value);
  };

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // The recorder is a native shared object that `useAudioRecorder` releases on
  // unmount. Track mount status so async callbacks (network round-trips) never
  // update state or touch the recorder after the component is gone.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const busy = state === 'uploading' || state === 'processing' || recorderState.isRecording;

  const reset = () => {
    setState('idle');
    setDraft(null);
    setPersonResult(null);
    setTranscript('');
    setErrorMessage('');
  };

  const showError = (error: unknown) => {
    if (!mountedRef.current) return;
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
      const trimmed = text.trim();
      const person = await parsePersonReminder(trimmed);
      if (!mountedRef.current) return;
      if (person.isPersonReminder && person.confidence >= PERSON_CONFIDENCE_THRESHOLD) {
        setTranscript('');
        setDraft(null);
        setPersonResult(person);
        setState('draft_ready');
        return;
      }
      const result = await parseReminderText(trimmed, accessToken);
      if (!mountedRef.current) return;
      setTranscript('');
      setPersonResult(null);
      setDraft(result);
      setState('draft_ready');
    } catch (error) {
      showError(error);
    }
  };

  const startRecording = async () => {
    setErrorMessage('');
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!mountedRef.current) return;
      if (!granted) {
        setErrorMessage(t('reminders.aiAssistant.errorMicPermission'));
        setState('error');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      // Unmounted during permission/prepare → recorder is released; don't record.
      if (!mountedRef.current) return;
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
      // Bail if we unmounted while stopping — the recorder is now released and
      // its `uri` would throw "shared object already released".
      if (!mountedRef.current) return;
      const uri = recorder.uri;
      if (!uri) throw new Error('Recording failed.');
      const result = await createVoiceReminderDraft({ uri, name: 'recording.m4a', type: 'audio/m4a' }, accessToken);
      if (!mountedRef.current) return;
      setTranscript(result.transcript);
      // Re-check the transcript for person intent so voice and text produce the
      // same analysis. Falls back to the generic draft on any failure.
      try {
        const person = await parsePersonReminder(result.transcript);
        if (!mountedRef.current) return;
        if (person.isPersonReminder && person.confidence >= PERSON_CONFIDENCE_THRESHOLD) {
          setDraft(null);
          setPersonResult(person);
          setState('draft_ready');
          return;
        }
      } catch {
        // best-effort — keep the generic draft
      }
      if (!mountedRef.current) return;
      setPersonResult(null);
      setDraft(result.draft);
      setState('draft_ready');
    } catch (error) {
      showError(error);
    }
  };

  const summaryLines = draft ? buildSummaryLines(draft, t) : [];

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
        <View className="mt-4 gap-3 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
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
            <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.aiAssistant.detectedType')}
            </Text>
            <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
              {t(TYPE_LABEL_KEYS[draft.reminderType])}
            </Text>
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
        </View>
      )}
    </SectionCard>
  );
}
