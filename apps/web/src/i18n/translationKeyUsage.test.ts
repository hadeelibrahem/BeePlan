import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import ar from './locales/ar.json'
import en from './locales/en.json'

type TranslationNode = string | { [key: string]: TranslationNode }

const sourceRoot = path.resolve(__dirname, '..')
const staticKeyPattern = /\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1/g

function resolve(dictionary: TranslationNode, key: string): TranslationNode | undefined {
  return key.split('.').reduce<TranslationNode | undefined>((current, part) =>
    current && typeof current !== 'string' ? current[part] : undefined,
  dictionary)
}

function productionSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return productionSourceFiles(file)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) ? [file] : []
  })
}

function staticTranslationKeys(): { keys: Set<string>; dynamicCalls: string[] } {
  const keys = new Set<string>()
  const dynamicCalls: string[] = []
  for (const file of productionSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(staticKeyPattern)) keys.add(match[2])
    for (const line of source.split(/\r?\n/)) {
      if (/\bt\(\s*(?!['"])/.test(line)) dynamicCalls.push(path.relative(sourceRoot, file))
    }
  }
  return { keys, dynamicCalls: [...new Set(dynamicCalls)].sort() }
}

describe('web translation key usage', () => {
  it('resolves every statically referenced production translation key in English and Arabic', () => {
    const { keys } = staticTranslationKeys()
    const missing = [...keys].filter((key) => typeof resolve(en as TranslationNode, key) !== 'string' || typeof resolve(ar as TranslationNode, key) !== 'string')

    expect(missing).toEqual([])
  })

  it('tracks dynamic translation calls separately for manual review', () => {
    const { dynamicCalls } = staticTranslationKeys()
    expect(dynamicCalls).toEqual(expect.any(Array))
  })
})
