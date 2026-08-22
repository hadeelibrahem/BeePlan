import type { FeedbackItem } from './feedbackApi';

/** Keeps server ordering while preventing overlap between paginated responses. */
export function mergeFeedbackPages(pages: Array<{ items: FeedbackItem[] }>) {
  return [...new Map(pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
}
