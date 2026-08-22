import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { LanguageProvider, useLanguage } from './LanguageContext'

function LanguageProbe() {
  const { language, setLanguage } = useLanguage()

  useEffect(() => setLanguage('ar'), [setLanguage])

  return <span>{language}</span>
}

describe('LanguageProvider', () => {
  it('persists Arabic and applies RTL document direction', async () => {
    window.localStorage.clear()
    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    )

    expect(await screen.findByText('ar')).toBeInTheDocument()
    expect(window.localStorage.getItem('beeplan.language-preference')).toBe('ar')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
  })
})
