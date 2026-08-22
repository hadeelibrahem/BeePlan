import { describe, expect, it } from '@jest/globals';
import ar from './locales/ar.json';
import en from './locales/en.json';

type TranslationNode = string | { [key: string]: TranslationNode };

function leafKeys(node: TranslationNode, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  return Object.entries(node).flatMap(([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key));
}

describe('mobile locale parity', () => {
  it('keeps every English translation key available in Arabic', () => {
    expect(leafKeys(ar as TranslationNode).sort()).toEqual(leafKeys(en as TranslationNode).sort());
  });
});
