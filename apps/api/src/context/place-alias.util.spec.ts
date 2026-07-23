import { normalizeAlias, textContainsAlias } from './place-alias.util';

describe('normalizeAlias', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeAlias('  My   HOUSE ')).toBe('my house');
  });

  it('folds Arabic letter variants and strips the definite article', () => {
    // "الجامعة" (the university) and "جامعة" (university) normalize the same.
    expect(normalizeAlias('الجامعة')).toBe(normalizeAlias('جامعة'));
  });

  it('strips punctuation', () => {
    expect(normalizeAlias('home!!')).toBe('home');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeAlias(undefined as unknown as string)).toBe('');
  });
});

describe('textContainsAlias', () => {
  it('matches a single alias token as a whole word', () => {
    expect(textContainsAlias('pick up milk from home tonight', normalizeAlias('home'))).toBe(true);
  });

  it('does not match a single token as a substring of another word', () => {
    expect(textContainsAlias('go to the gymnastics class', normalizeAlias('gym'))).toBe(false);
  });

  it('matches a multi-word alias anywhere in the text', () => {
    expect(textContainsAlias('grab a drink at the coffee shop later', normalizeAlias('coffee shop'))).toBe(true);
  });

  it('matches an Arabic alias mention', () => {
    expect(textContainsAlias('ذكرني اشتري خبز من البيت', normalizeAlias('بيت'))).toBe(true);
  });

  it('returns false for empty inputs', () => {
    expect(textContainsAlias('', 'home')).toBe(false);
    expect(textContainsAlias('home', '')).toBe(false);
  });
});
