import { createHash } from 'crypto';
export const FEEDBACK_CLUSTER_PROMPT_VERSION = 'feedback-clustering-v1';
export const FEEDBACK_CLUSTER_CONTEXT_VERSION = 'feedback-cluster-context-v1';
export type EligibleFeedbackContext = { id: string; title: string; description: string; category: string; status: string; voteCount: number };
export function buildFeedbackClusteringContext(items: EligibleFeedbackContext[]) { const feedback = items.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, 50).map(({ id, title, description, category, status, voteCount }) => ({ id, title: title.slice(0, 160), description: description.slice(0, 2000), category, status, voteCount })); return { version: FEEDBACK_CLUSTER_CONTEXT_VERSION, feedback }; }
export function feedbackClusteringContextHash(context: ReturnType<typeof buildFeedbackClusteringContext>) { return createHash('sha256').update(JSON.stringify(context)).digest('hex'); }
