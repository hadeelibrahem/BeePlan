import { apiFetch, readJsonOrThrow } from '../../lib/apiClient';

export type FeedbackStatus = 'submitted' | 'reviewing' | 'planned' | 'in_development' | 'released' | 'declined';
export type FeedbackItem = { id: string; category: 'idea' | 'improvement' | 'problem' | 'other'; title: string; description: string; status: FeedbackStatus; createdAt: string; updatedAt: string; releasedAt: string | null; voteCount: number; voted: boolean; author: { id: string; displayName: string } };
export type FeedbackPage = { items: FeedbackItem[]; total: number };
const request = async <T>(token: string, path: string, method = 'GET', body?: unknown) => readJsonOrThrow<T>(await apiFetch(path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), path);
export const feedbackApi = {
  list: (token: string, sort: 'most_voted' | 'newest' | 'recently_updated', page = 1, limit = 20) => request<FeedbackPage>(token, `/feedback?sort=${sort}&page=${page}&limit=${limit}`),
  detail: (token: string, id: string) => request<FeedbackItem>(token, `/feedback/${id}`),
  submit: (token: string, body: Pick<FeedbackItem, 'category' | 'title' | 'description'>) => request<FeedbackItem>(token, '/feedback', 'POST', body),
  vote: (token: string, id: string, voted: boolean) => request<FeedbackItem>(token, `/feedback/${id}/vote`, voted ? 'DELETE' : 'POST'),
};
export const feedbackStatusLabel = (status: FeedbackStatus) => ({ submitted: 'Submitted', reviewing: 'Reviewing', planned: 'Planned', in_development: 'In Development', released: 'Released', declined: 'Declined' }[status]);
