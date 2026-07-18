import { useRef } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { Modal } from './layout/Modal'

type Props = { open: boolean; title: string; message: string; confirmLabel: string; isConfirming?: boolean; onCancel: () => void; onConfirm: () => void }

export function ConfirmDestructiveModal({ open, title, message, confirmLabel, isConfirming = false, onCancel, onConfirm }: Props) {
  const { t } = useLanguage()
  const cancelRef = useRef<HTMLButtonElement>(null)
  return <Modal open={open} title={title} description={message} onClose={() => !isConfirming && onCancel()} initialFocusRef={cancelRef} footer={<><button ref={cancelRef} type="button" disabled={isConfirming} onClick={onCancel} className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-bold text-[var(--bp-text)] disabled:opacity-50">{t('common.cancel')}</button><button type="button" disabled={isConfirming} onClick={onConfirm} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50">{confirmLabel}</button></>}/>
}
