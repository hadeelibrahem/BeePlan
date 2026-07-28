import type { ReminderType, TriggerType } from './reminders.types';

export type ReminderDraftPriority = 'low' | 'medium' | 'high';
export type ReminderDraftRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderDraftLocationMode = 'none' | 'specific' | 'general';

export type ReminderDraft = {
  title: string;
  description: string;
  reminderType: ReminderType;
  priority: ReminderDraftPriority;
  time: {
    date: string;
    time: string;
    repeat: ReminderDraftRepeat;
  };
  location: {
    mode: ReminderDraftLocationMode;
    name: string;
    address: string;
    category: string;
    trigger: TriggerType;
    radius: number;
    latitude?: number | null;
    longitude?: number | null;
    savedPlaceId?: string | null;
    match?: {
      status: 'matched' | 'ambiguous' | 'no_match' | 'fallback';
      confidence: number;
      clarificationRequired: boolean;
      candidates: { id: string; name: string; address: string | null }[];
    };
  };
  context: {
    condition: string;
  };
  checklist: string[];
};

export type VoiceReminderDraftResponse = {
  transcript: string;
  draft: ReminderDraft;
};

export type AiAssistantMode = 'text' | 'voice';

export type AiAssistantState = 'idle' | 'recording' | 'uploading' | 'processing' | 'draft_ready' | 'error';
