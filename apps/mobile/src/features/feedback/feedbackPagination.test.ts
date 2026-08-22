import { feedbackStatusLabel, type FeedbackItem } from './feedbackApi';
import { mergeFeedbackPages } from './feedbackPagination';

const item = (id: string): FeedbackItem => ({ id, category: 'idea', title: id, description: 'description', status: 'submitted', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', releasedAt: null, voteCount: 0, voted: false, author: { id: 'author', displayName: 'Author' } });

describe('mobile feedback pagination', () => {
  it('appends later pages while preserving server order', () => expect(mergeFeedbackPages([{ items: [item('a'), item('b')] }, { items: [item('c'), item('d')] }]).map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']));
  it('deduplicates overlapping feedback by ID', () => expect(mergeFeedbackPages([{ items: [item('a'), item('b')] }, { items: [item('b'), item('c')] }]).map((entry) => entry.id)).toEqual(['a', 'b', 'c']));
  it('uses readable lifecycle labels', () => expect([ 'submitted', 'reviewing', 'planned', 'in_development', 'released', 'declined' ].map((status) => feedbackStatusLabel(status as FeedbackItem['status']))).toEqual(['Submitted', 'Reviewing', 'Planned', 'In Development', 'Released', 'Declined']));
});
