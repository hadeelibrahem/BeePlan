import type { ReminderDraft } from '../types/aiAssistant.types';
import type {
  ChecklistReminderTrigger,
  GeneralLocationCategory,
  LocationReminderConfig,
  Reminder,
  ReminderLocationTrigger,
  ReminderTimeTrigger,
  TriggerType,
} from '../types/reminders.types';
import { DEFAULT_UNKNOWN_CONFIDENCE, getCategoryDefaultRadius, matchGeneralCategory, SMART_LOCATION_CATEGORIES } from './smartLocationCategories';

export type SmartLocationSummary = {
  category: GeneralLocationCategory;
  trigger: TriggerType;
  radius: number;
  reason: string;
  confidence: number;
};

export type SmartLocationOverrides = {
  category?: GeneralLocationCategory;
  radius?: number;
  confidence?: number;
  reason?: string;
};

/**
 * Derives the smart-location "understanding" (category/trigger/radius/reason/confidence)
 * for a location draft, or null if the draft doesn't qualify for smart location.
 * Every field prefers a real value supplied by the caller (AI/rules inference result,
 * or the user's own edits) over a computed default — nothing here is a fixed constant.
 */
export function getSmartLocationSummary(
  draft: ReminderDraft,
  overrides?: SmartLocationOverrides,
): SmartLocationSummary | null {
  if (draft.reminderType !== 'location' || draft.location.mode !== 'general') return null;

  const category = overrides?.category ?? matchGeneralCategory(draft.location.category || draft.location.name).category;
  if (!SMART_LOCATION_CATEGORIES.includes(category)) return null;

  return {
    category,
    trigger: draft.location.trigger,
    radius: overrides?.radius ?? getCategoryDefaultRadius(category),
    reason: overrides?.reason ?? `This reminder triggers when you're near ${category.replaceAll('_', ' ')}.`,
    confidence: overrides?.confidence ?? DEFAULT_UNKNOWN_CONFIDENCE,
  };
}

/**
 * Mobile stores `remindAt` as a full UTC ISO string (see DateTimeSection's
 * `commitDateTime`), unlike web's local `datetime-local` string — so the
 * AI's date+time, treated as local wall-clock time, must be converted here.
 */
function buildRemindAt(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const candidate = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(candidate.getTime())) return undefined;
  return candidate.toISOString();
}

function buildLocationConfig(
  draft: ReminderDraft,
  categoryOverride?: GeneralLocationCategory,
  radiusOverride?: number,
): LocationReminderConfig {
  const { location } = draft;

  if (location.mode === 'general') {
    const category = categoryOverride ?? matchGeneralCategory(location.category || location.name).category;
    return {
      mode: 'general_category',
      generalCategory: categoryOverride ? { category: categoryOverride } : matchGeneralCategory(location.category || location.name),
      trigger: location.trigger,
      radiusMeters: radiusOverride ?? getCategoryDefaultRadius(category),
    };
  }

  // 'specific' (and 'none') modes need a geocoded place (lat/lng) that free-form
  // AI text can't provide — seed the search field with the extracted name so the
  // user only has to pick the matching suggestion, without guessing coordinates.
  return {
    mode: 'specific_place',
    trigger: location.trigger,
    radiusMeters: location.radius || 100,
    pendingPlaceName: location.name.trim() || undefined,
  };
}

function buildChecklistTrigger(draft: ReminderDraft): ChecklistReminderTrigger {
  const hasTime = Boolean(draft.time.date.trim() && draft.time.time.trim());
  const hasLocation = draft.location.mode !== 'none' && Boolean(draft.location.name || draft.location.category);

  const time: ReminderTimeTrigger = hasTime
    ? { type: 'specific_time', specificTime: { date: draft.time.date, time: draft.time.time, repeat: draft.time.repeat } }
    : { type: 'none' };

  const location: ReminderLocationTrigger = !hasLocation
    ? { type: 'none' }
    : draft.location.mode === 'general'
      ? { type: 'general_location', generalLocation: matchGeneralCategory(draft.location.category || draft.location.name) }
      : { type: 'specific_location', pendingPlaceName: draft.location.name.trim() || undefined };

  return { time, location };
}

/**
 * Converts a backend AI reminder draft into a `Reminder`-shaped object that
 * can be handed to `ReminderForm`'s `initialReminder` prop to prefill it.
 * Fields the AI left empty, or that need geocoding we can't do from text
 * alone, are simply omitted so the form falls back to its own defaults.
 */
export type ApplyDraftOptions = {
  categoryOverride?: GeneralLocationCategory;
  disableSmartLocation?: boolean;
  radius?: number;
  confidence?: number;
  reason?: string;
};

export function mapDraftToReminder(draft: ReminderDraft, options?: ApplyDraftOptions): Reminder {
  const now = new Date().toISOString();

  const reminder: Reminder = {
    id: 'ai-draft',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    type: draft.reminderType,
    priority: draft.priority,
  };

  if (draft.reminderType === 'time') {
    reminder.remindAt = buildRemindAt(draft.time.date, draft.time.time);
    if (reminder.remindAt) {
      reminder.repeatRule = { frequency: draft.time.repeat, interval: 1 };
    }
  }

  if (draft.reminderType === 'location') {
    reminder.location = buildLocationConfig(draft, options?.categoryOverride, options?.radius);

    const summary = options?.disableSmartLocation
      ? null
      : getSmartLocationSummary(draft, {
          category: options?.categoryOverride,
          radius: options?.radius,
          confidence: options?.confidence,
          reason: options?.reason,
        });
    if (summary) {
      reminder.smartLocationEnabled = true;
      reminder.smartPlaceCategory = summary.category;
      reminder.triggerRadius = summary.radius;
      reminder.triggerOnEnter = summary.trigger === 'arrive';
      reminder.triggerCooldown = 1440;
      reminder.smartLocationReason = summary.reason;
      reminder.smartLocationConfidence = summary.confidence;
    }
  }

  if (draft.reminderType === 'context' && draft.context.condition.trim()) {
    reminder.context = { condition: draft.context.condition.trim() };
  }

  if (draft.reminderType === 'checklist') {
    if (draft.checklist.length) {
      reminder.checklistItems = draft.checklist
        .filter((item) => item.trim())
        .map((title, index) => ({ id: `ai-item-${index}`, title, isDone: false }));
    }
    reminder.checklistReminderTrigger = buildChecklistTrigger(draft);
  }

  return reminder;
}
