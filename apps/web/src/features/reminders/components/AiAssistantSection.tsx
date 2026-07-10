import { useRef, useState } from 'react'
import { OutlineButton, PrimaryButton, SectionCard } from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import { parsePersonReminder } from '../../social/api/social.api'
import type { ParsePersonReminderResult } from '../../social/types/social.types'
import { createVoiceReminderDraft, parseReminderText } from '../api/reminders.api'
import type { AiAssistantMode, AiAssistantState, ReminderDraft } from '../types/aiAssistant.types'

type Props = {
  onApplyDraft: (draft: ReminderDraft) => void
  onApplyPersonDraft: (result: ParsePersonReminderResult) => void
  accessToken: string
}

// Above this, a parse-person-reminder result is treated as a person reminder and
// routed to the Person form instead of the generic draft mapping.
const PERSON_CONFIDENCE_THRESHOLD = 0.5

// The AI prompt is persisted so navigating to People (e.g. to add a missing
// friend) and back doesn't lose what the user typed. Cleared on a successful save.
export const AI_REMINDER_TEXT_KEY = 'beeplan:createReminder:aiText'

export function clearAiReminderText() {
  try {
    sessionStorage.removeItem(AI_REMINDER_TEXT_KEY)
  } catch {
    // sessionStorage unavailable (private mode / SSR) — nothing to clear.
  }
}

function readPersistedText(): string {
  try {
    return sessionStorage.getItem(AI_REMINDER_TEXT_KEY) ?? ''
  } catch {
    return ''
  }
}

type Translate = (key: string, params?: Record<string, string | number>) => string

const TYPE_LABEL_KEYS: Record<ReminderDraft['reminderType'], string> = {
  time: 'reminders.typeTime',
  location: 'reminders.typeLocation',
  context: 'reminders.typeContext',
  checklist: 'reminders.typeChecklist',
  // The standard AI assistant never emits 'person' as a reminderType (person
  // reminders are created via the AI-first People flow), but ReminderType now
  // includes it, so the exhaustive map needs an entry.
  person: 'reminders.typePerson',
}

function friendlyErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/transcribe|speech|audio file|no speech/i.test(message)) return 'reminders.aiAssistant.errorUpload'
  if (/parse|ai returned|gemini|ai service/i.test(message)) return 'reminders.aiAssistant.errorAiUnavailable'
  if (!message) return 'reminders.aiAssistant.errorUnderstand'
  return ''
}

function buildSummaryLines(draft: ReminderDraft, t: Translate): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = []

  if (draft.reminderType === 'time') {
    const parts = [draft.time.date, draft.time.time].filter(Boolean)
    if (parts.length) {
      const repeatSuffix = draft.time.repeat !== 'none' ? ` (${draft.time.repeat})` : ''
      lines.push({ label: t('reminders.aiAssistant.summaryWhen'), value: `${parts.join(' ')}${repeatSuffix}` })
    }
  }

  if (draft.reminderType === 'location') {
    const parts = [draft.location.name, draft.location.category].filter(Boolean)
    if (parts.length) {
      lines.push({ label: t('reminders.aiAssistant.summaryWhere'), value: `${parts.join(' · ')} (${draft.location.trigger})` })
    }
  }

  if (draft.reminderType === 'context' && draft.context.condition) {
    lines.push({ label: t('reminders.aiAssistant.summaryCondition'), value: draft.context.condition })
  }

  if (draft.reminderType === 'checklist' && draft.checklist.length) {
    lines.push({ label: t('reminders.aiAssistant.summaryItems'), value: draft.checklist.join(', ') })
  }

  return lines
}

export function AiAssistantSection({ onApplyDraft, onApplyPersonDraft, accessToken }: Props) {
  const { t } = useLanguage()
  const [mode, setMode] = useState<AiAssistantMode>('text')
  const [state, setState] = useState<AiAssistantState>('idle')
  const [text, setTextState] = useState(readPersistedText)

  const setText = (value: string) => {
    setTextState(value)
    try {
      sessionStorage.setItem(AI_REMINDER_TEXT_KEY, value)
    } catch {
      // Persistence is best-effort; the field still works without it.
    }
  }
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<ReminderDraft | null>(null)
  const [personResult, setPersonResult] = useState<ParsePersonReminderResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const busy = state === 'uploading' || state === 'processing' || state === 'recording'

  const reset = () => {
    setState('idle')
    setDraft(null)
    setPersonResult(null)
    setTranscript('')
    setErrorMessage('')
  }

  const showError = (error: unknown) => {
    const key = friendlyErrorKey(error)
    setErrorMessage(key ? t(key) : error instanceof Error ? error.message : t('reminders.aiAssistant.errorUnderstand'))
    setState('error')
  }

  // Person detection runs first: parse-person-reminder is cheap and, when it
  // confidently identifies a person reminder, we skip the generic parser and
  // route straight to the Person form. Otherwise we fall back to the standard
  // draft mapping — same as before.
  const handleFillWithAi = async () => {
    if (!text.trim() || busy) return
    setErrorMessage('')
    setState('processing')
    try {
      const trimmed = text.trim()
      const person = await parsePersonReminder(trimmed, accessToken)
      if (person.isPersonReminder && person.confidence >= PERSON_CONFIDENCE_THRESHOLD) {
        setTranscript('')
        setDraft(null)
        setPersonResult(person)
        setState('draft_ready')
        return
      }
      const result = await parseReminderText(trimmed, accessToken)
      setTranscript('')
      setPersonResult(null)
      setDraft(result)
      setState('draft_ready')
    } catch (error) {
      showError(error)
    }
  }

  const startRecording = async () => {
    setErrorMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setState('recording')
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        setErrorMessage(t('reminders.aiAssistant.errorMicPermission'))
      } else {
        setErrorMessage(t('reminders.aiAssistant.errorUpload'))
      }
      setState('error')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    setState('uploading')
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((track) => track.stop())
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      void createVoiceReminderDraft(blob, accessToken, 'recording.webm')
        .then(async (result) => {
          setTranscript(result.transcript)
          // Re-check the transcript for person intent so voice and text produce
          // the same analysis. Falls back to the generic draft the voice
          // endpoint already returned.
          try {
            const person = await parsePersonReminder(result.transcript, accessToken)
            if (person.isPersonReminder && person.confidence >= PERSON_CONFIDENCE_THRESHOLD) {
              setDraft(null)
              setPersonResult(person)
              setState('draft_ready')
              return
            }
          } catch {
            // Ignore — person detection is best-effort; keep the generic draft.
          }
          setPersonResult(null)
          setDraft(result.draft)
          setState('draft_ready')
        })
        .catch(showError)
    }
    recorder.stop()
  }

  const summaryLines = draft ? buildSummaryLines(draft, t) : []

  return (
    <SectionCard className="mb-6">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.aiAssistant.title')}</p>
      <p className="mb-4 mt-1 text-sm text-[var(--bp-muted)]">{t('reminders.aiAssistant.subtitle')}</p>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-1.5">
        {(['text', 'voice'] as AiAssistantMode[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option)
              reset()
            }}
            disabled={busy}
            aria-pressed={mode === option}
            className={`rounded-xl px-3 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === option
                ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                : 'border border-transparent text-[var(--bp-text)] hover:bg-[var(--bp-input)]'
            }`}
          >
            {t(option === 'text' ? 'reminders.aiAssistant.modeText' : 'reminders.aiAssistant.modeVoice')}
          </button>
        ))}
      </div>

      {mode === 'text' && (
        <div className="grid gap-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('reminders.aiAssistant.textPlaceholder')}
            disabled={busy}
            className="min-h-24 w-full resize-y rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 text-base text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)] disabled:opacity-60"
          />
          <PrimaryButton onClick={() => void handleFillWithAi()} disabled={!text.trim() || busy} loading={state === 'processing'}>
            {t('reminders.aiAssistant.fillWithAi')}
          </PrimaryButton>
        </div>
      )}

      {mode === 'voice' && (
        <div className="grid gap-3">
          {state !== 'recording' ? (
            <PrimaryButton onClick={() => void startRecording()} disabled={state === 'uploading' || state === 'processing'}>
              {t('reminders.aiAssistant.startRecording')}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={stopRecording}>{t('reminders.aiAssistant.stopRecording')}</PrimaryButton>
          )}
          {state === 'recording' && <p className="text-xs font-black text-[var(--bp-accent)]">{t('reminders.aiAssistant.recording')}</p>}
          {state === 'uploading' && <p className="text-xs font-semibold text-[var(--bp-muted)]">{t('reminders.aiAssistant.uploading')}</p>}
        </div>
      )}

      {state === 'processing' && mode === 'text' && (
        <p className="mt-3 text-xs font-semibold text-[var(--bp-muted)]">{t('reminders.aiAssistant.processing')}</p>
      )}

      {state === 'error' && errorMessage && <p className="mt-3 text-xs font-semibold text-red-400">{errorMessage}</p>}

      {state === 'draft_ready' && personResult && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
          {transcript && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.aiAssistant.transcript')}</p>
              <p className="mt-1 text-sm text-[var(--bp-text)]">{transcript}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.aiAssistant.detectedType')}</p>
            <p className="mt-1 text-sm font-bold text-[var(--bp-text)]">{t('reminders.typePerson')}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.title')}</p>
            <p className="mt-1 text-sm text-[var(--bp-text)]">
              {personResult.draft.title || personResult.draft.person.message || t('reminders.person.defaultTitle')}
            </p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.person.friend')}</p>
            <p className="mt-1 text-sm text-[var(--bp-text)]">
              {personResult.matchedFriendName || personResult.draft.person.personName || t('reminders.person.notMatched')}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.person.confidence')}</span>
              <span className="text-xs font-black text-[var(--bp-accent)]">{Math.round(personResult.confidence * 100)}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bp-border)]">
              <div className="h-full rounded-full bg-[var(--bp-accent)]" style={{ width: `${Math.round(personResult.confidence * 100)}%` }} />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <PrimaryButton onClick={() => onApplyPersonDraft(personResult)}>{t('reminders.aiAssistant.applyToForm')}</PrimaryButton>
            <OutlineButton onClick={reset}>{t('reminders.aiAssistant.clear')}</OutlineButton>
          </div>
        </div>
      )}

      {state === 'draft_ready' && draft && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
          {transcript && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.aiAssistant.transcript')}</p>
              <p className="mt-1 text-sm text-[var(--bp-text)]">{transcript}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.aiAssistant.detectedType')}</p>
            <p className="mt-1 text-sm font-bold text-[var(--bp-text)]">{t(TYPE_LABEL_KEYS[draft.reminderType])}</p>
          </div>
          {draft.title && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.title')}</p>
              <p className="mt-1 text-sm text-[var(--bp-text)]">{draft.title}</p>
            </div>
          )}
          {summaryLines.map((line) => (
            <div key={line.label}>
              <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{line.label}</p>
              <p className="mt-1 text-sm text-[var(--bp-text)]">{line.value}</p>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <PrimaryButton onClick={() => onApplyDraft(draft)}>{t('reminders.aiAssistant.applyToForm')}</PrimaryButton>
            <OutlineButton onClick={reset}>{t('reminders.aiAssistant.clear')}</OutlineButton>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
