import { feedbackStatuses } from './feedback.service';

describe('feedback lifecycle contract', () => {
  it('exposes the supported public lifecycle statuses', () => {
    expect(feedbackStatuses).toEqual(['submitted', 'reviewing', 'planned', 'in_development', 'released', 'declined']);
  });
});
