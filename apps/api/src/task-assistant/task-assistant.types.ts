import type {
  Destination,
  TravelMode,
} from '../weather-travel/weather-travel.types';

export const TASK_CONTEXTS = [
  'travel',
  'flight',
  'university',
  'school',
  'work',
  'interview',
  'meeting',
  'online_meeting',
  'medical',
  'pharmacy',
  'shopping',
  'exercise',
  'outdoor_activity',
  'appointment',
  'document_submission',
  'bill_payment',
  'general',
] as const;
export type TaskContextType = (typeof TASK_CONTEXTS)[number];
export type TaskContextConfidence = 'high' | 'medium' | 'low' | 'unavailable';
export type EvidenceType =
  | 'text_evidence'
  | 'primary_context'
  | 'logistics_evidence'
  | 'verified_fact'
  | 'deterministic_recommendation'
  | 'general_preparation';

export type TaskContextInput = {
  taskId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  labels?: string[];
  subtasks?: { title: string; description?: string | null }[];
  attachments?: { name?: string; fileName?: string }[];
  destination?: Destination | null;
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
  timezone?: string | null;
  dueDate?: Date | string | null;
  travelMode?: TravelMode | null;
  correctedContext?: TaskContextType | null;
};

export type ExtractedTaskContext = TaskContextInput & {
  text: string;
  scheduledExecution: string | null;
  deadline: string | null;
  travelRequired: boolean;
  likelyDocuments: string[];
  likelyEquipment: string[];
  likelyClothingNeeds: string[];
  externalFactsRequired: string[];
  assumptions: string[];
};

export type ClassifiedTaskContext = ExtractedTaskContext & {
  primaryContext: TaskContextType;
  secondaryContexts: TaskContextType[];
  confidence: TaskContextConfidence;
  confidenceReason: string;
};

export type PreparationSuggestion = {
  type: string;
  title: string;
  description: string;
  reason: string;
  evidence: Record<string, unknown>;
  evidenceType: EvidenceType;
  dueAt?: string | null;
  notificationAt?: string | null;
  quantity?: string | null;
  quantityUnit?: string | null;
  category?: PackingCategory | null;
  priority?: AssistantPriority;
  notificationEligible?: boolean;
};

export type AssistantPriority = 'critical' | 'high' | 'medium' | 'low';
export type PackingCategory =
  | 'documents'
  | 'clothing'
  | 'electronics'
  | 'health'
  | 'toiletries'
  | 'work_study'
  | 'activity_equipment'
  | 'weather_protection'
  | 'travel_essentials';
export type TimelineStageType =
  | 'early_preparation'
  | 'day_before'
  | 'packing'
  | 'document_check'
  | 'final_check'
  | 'departure_preparation'
  | 'departure'
  | 'task_start'
  | 'follow_up';

export type TaskAssistantPreferences = {
  enabled: boolean;
  preparationChecklistsEnabled: boolean;
  travelAdviceEnabled: boolean;
  weatherAdviceEnabled: boolean;
  documentAdviceEnabled: boolean;
  clothingAdviceEnabled: boolean;
  umbrellaAdviceEnabled: boolean;
  hydrationAdviceEnabled: boolean;
  proactiveAssistanceEnabled: boolean;
  dynamicPreparationEnabled: boolean;
  dynamicPackingEnabled: boolean;
  contextTimelineEnabled: boolean;
  contextualNotificationsEnabled: boolean;
  electronicsAdviceEnabled: boolean;
  medicationAdviceEnabled: boolean;
  departureRemindersEnabled: boolean;
  notificationMode: 'smart' | 'minimal' | 'important_only';
  defaultTravelMode: TravelMode;
  language: 'en' | 'ar';
};
