import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave without saving?'

type Options = {
  /** Confirmation copy shown before leaving. */
  message?: string
  /** How the confirmation is shown. Defaults to window.confirm (overridable for tests). */
  confirm?: (message: string) => boolean
}

/**
 * Warns before leaving a dirty form. Covers three exit paths:
 *  - in-app route changes (Cancel, back button, sidebar nav) via useBlocker,
 *  - closing/reloading the tab via the native beforeunload prompt,
 * and stays silent when the form is clean.
 *
 * Call the returned `markSaved()` right before navigating on a successful save
 * so the guard doesn't warn about the changes that were just persisted.
 */
export function useUnsavedChangesGuard(dirty: boolean, options: Options = {}) {
  const message = options.message ?? DEFAULT_MESSAGE
  const confirm = options.confirm ?? ((text: string) => window.confirm(text))

  const savedRef = useRef(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // Re-arm the guard if the form becomes dirty again after a save (e.g. an
  // inline save that keeps the user on the form).
  useEffect(() => {
    if (dirty) savedRef.current = false
  }, [dirty])

  const shouldBlock = useCallback(() => dirtyRef.current && !savedRef.current, [])
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (confirm(message)) blocker.proceed()
    else blocker.reset()
  }, [blocker, confirm, message])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || savedRef.current) return
      event.preventDefault()
      // Legacy browsers require returnValue to be set to trigger the prompt.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return {
    /** Disable the guard for the imminent post-save navigation. */
    markSaved: useCallback(() => {
      savedRef.current = true
    }, []),
  }
}
