import { describe, expect, it } from 'vitest'
import ar from './locales/ar.json'
import en from './locales/en.json'

type TranslationNode = string | { [key: string]: TranslationNode }

function leafKeys(node: TranslationNode, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node).flatMap(([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key))
}

describe('web locale parity', () => {
  it('keeps every English translation key available in Arabic', () => {
    const english = leafKeys(en as TranslationNode).sort()
    const arabic = leafKeys(ar as TranslationNode).sort()

    expect(arabic).toEqual(english)
  })
})
