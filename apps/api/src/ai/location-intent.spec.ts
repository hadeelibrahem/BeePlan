import { detectLocationTrigger } from './ai.service';

describe('detectLocationTrigger', () => {
  it.each([
    ['remind me when I arrive at home', 'arrive'],
    ['remind me when I get to campus', 'arrive'],
    ['ذكرني لما أوصل البيت', 'arrive'],
    ['remind me when I leave work', 'leave'],
    ['remind me when I go out from the gym', 'leave'],
    ['ذكرني لما أطلع من الجامعة', 'leave'],
  ] as const)('detects %s as %s', (text, expected) => {
    expect(detectLocationTrigger(text)).toBe(expected);
  });

  it('does not invent an intent when the sentence has none', () => {
    expect(detectLocationTrigger('remember the office')).toBeNull();
  });
});
