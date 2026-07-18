import { describe, expect, it } from 'vitest'
import ar from './locales/ar.json'
import en from './locales/en.json'

type TranslationNode = string | { [key: string]: TranslationNode }

function leafKeys(node: TranslationNode, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node).flatMap(([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key))
}

describe('task screen locale parity', () => {
  it('keeps every taskUi translation key available in Arabic', () => {
    const english = leafKeys(en.taskUi as TranslationNode).sort()
    const arabic = leafKeys(ar.taskUi as TranslationNode).sort()

    expect(arabic).toEqual(english)
  })
})
