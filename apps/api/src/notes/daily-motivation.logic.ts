export type DailyMotivationSummary = {
  completedTasks: number;
  completedSubtasks: number;
  focusSessions: number;
  focusMinutes: number;
  highPriorityCompleted: number;
  inProgressTasks: number;
  remainingPlannedTasks: number;
  completedReminders: number;
  recentCompletedTitles: string[];
  latestActivityTimestamp: string | null;
};

export type MotivationLanguage = 'en' | 'ar';

export const DAILY_MOTIVATION_SYSTEM_PROMPT =
  'You generate one short, supportive productivity message based only on the provided structured activity summary. Do not invent achievements. Do not criticize, shame, diagnose, or give medical advice. Do not use emojis unless requested. Return only the final sentence.';

export function motivationCategory(summary: DailyMotivationSummary) {
  if (summary.remainingPlannedTasks > 0 && summary.completedTasks + summary.completedSubtasks >= summary.remainingPlannedTasks) return 'completedMostPlannedWork';
  if (summary.focusMinutes >= 90 && summary.completedTasks + summary.completedSubtasks <= 1) return 'focusHeavy';
  if (summary.completedTasks >= 3 || summary.completedSubtasks >= 6 || summary.focusMinutes >= 120) return 'strongProgress';
  if (summary.completedTasks + summary.completedSubtasks > 0 || summary.focusMinutes > 0 || summary.completedReminders > 0) return 'moderateProgress';
  if (summary.inProgressTasks > 0 || summary.remainingPlannedTasks > 0) return 'started';
  return 'noActivity';
}

export function fallbackMotivation(summary: DailyMotivationSummary, language: MotivationLanguage): string {
  const category = motivationCategory(summary);
  const english: Record<string, string> = {
    noActivity: 'Start with one small step; today still has room for progress.',
    started: 'You have a clear starting point; one focused step can make the next task feel lighter.',
    moderateProgress: 'You have made meaningful progress today—keep your next step simple and focused.',
    strongProgress: 'You have accomplished a lot today; protect your momentum without rushing.',
    focusHeavy: 'You have invested real focus today; take a breath and choose what deserves your energy next.',
    completedMostPlannedWork: 'You have moved through most of today’s plan; let the remaining work stay calm and clear.',
  };
  const arabic: Record<string, string> = {
    noActivity: 'يومك ما زال مفتوحًا؛ ابدأ بخطوة صغيرة تمنحك مساحة للتقدم.',
    started: 'لديك نقطة بداية واضحة؛ خطوة مركزة واحدة قد تجعل المهمة التالية أخف.',
    moderateProgress: 'أنجزت تقدمًا ذا معنى اليوم؛ اجعل خطوتك التالية بسيطة ومركزة.',
    strongProgress: 'أنجزت الكثير اليوم؛ حافظ على تقدمك بهدوء ومن دون استعجال.',
    focusHeavy: 'استثمرت تركيزًا حقيقيًا اليوم؛ خذ نفسًا واختر ما يستحق طاقتك التالية.',
    completedMostPlannedWork: 'أنجزت معظم خطة اليوم؛ دع ما تبقى واضحًا وهادئًا.',
  };
  return (language === 'ar' ? arabic : english)[category];
}

export function validateMotivationMessage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const message = value.trim();
  if (!message || /[\r\n]/.test(message) || /(^|\s)(#|\*\*|`|[-*]\s)/.test(message)) return false;
  const words = message.split(/\s+/u).filter(Boolean);
  return words.length >= 8 && words.length <= 24;
}

export function activityFingerprint(summary: DailyMotivationSummary): string {
  return JSON.stringify({
    completedTasks: summary.completedTasks,
    completedSubtasks: summary.completedSubtasks,
    focusSessions: summary.focusSessions,
    focusMinutes: summary.focusMinutes,
    completedReminders: summary.completedReminders,
    latestActivityTimestamp: summary.latestActivityTimestamp,
  });
}
