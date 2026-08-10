import { ArrowRight, Dices } from 'lucide-react'
import { SectionCard } from './layout'
import { useLanguage } from '../i18n/LanguageContext'

export function RandomStartCard({ onOpen }: { onOpen: () => void }) {
  const { language, isRTL } = useLanguage()
  return <SectionCard className="border-[var(--bp-accent)]/25 bg-gradient-to-r from-[var(--bp-surface)] to-[var(--bp-accent)]/8 p-4">
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 text-start" aria-label={language === 'ar' ? 'افتح البدء العشوائي' : 'Open Random Start'}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--bp-accent)]/15 text-[var(--bp-accent-ink)]"><Dices size={21}/></span>
      <span className="min-w-0 flex-1"><strong className="block text-base">{language === 'ar' ? 'مش عارف شو تعمل بعدين؟' : "Can't decide what's next?"}</strong><span className="mt-0.5 block text-sm text-[var(--bp-muted)]">{language === 'ar' ? 'دع العجلة تختار مهمتك التالية.' : 'Let the wheel choose your next task.'}</span></span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-black text-[var(--bp-accent-ink)]">{language === 'ar' ? 'افتح' : 'Open'}<ArrowRight className={isRTL ? 'rotate-180' : ''} size={16}/></span>
    </button>
  </SectionCard>
}
