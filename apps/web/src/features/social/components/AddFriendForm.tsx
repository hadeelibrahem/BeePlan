import { useState } from 'react'
import { PeopleIcon, PrimaryButton } from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  /** Sends the request. Resolves on success; throws with a message on failure. */
  onAdd: (email: string) => Promise<void>
}

/**
 * Self-contained "add a friend" card: email input with format validation, a
 * loading state, and inline success/error feedback. Reused on the People page.
 */
export function AddFriendForm({ onAdd }: Props) {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const valid = EMAIL_RE.test(email.trim())

  const submit = async () => {
    setError('')
    setSuccess('')
    if (!valid) {
      setError(t('people.addFriend.invalidEmail'))
      return
    }
    setLoading(true)
    try {
      await onAdd(email.trim().toLowerCase())
      setEmail('')
      setSuccess(t('people.addFriend.sent'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      id="add-friend-card"
      className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5"
    >
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--bp-text)]">
        <PeopleIcon className="h-4 w-4" /> {t('people.addFriend.title')}
      </h3>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError('')
            setSuccess('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder={t('people.addFriend.placeholder')}
          className="flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
        />
        <PrimaryButton onClick={() => void submit()} disabled={!valid || loading} loading={loading}>
          {t('people.addFriend.send')}
        </PrimaryButton>
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-500">{success}</p>}
    </section>
  )
}
