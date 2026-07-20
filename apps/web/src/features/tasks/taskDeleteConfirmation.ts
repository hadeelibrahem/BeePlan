import { useCallback, useEffect, useRef, useState } from 'react'

export type TaskDeleteConfirmationState = {
  isOpen: boolean
  isDeleting: boolean
  error: string
}

export const initialTaskDeleteConfirmationState: TaskDeleteConfirmationState = {
  isOpen: false,
  isDeleting: false,
  error: '',
}

function toDeleteErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Could not delete this task. Please try again.'
}

export function createTaskDeleteConfirmationController(
  executeDelete: () => Promise<void>,
  onStateChange?: (state: TaskDeleteConfirmationState) => void,
) {
  let state = initialTaskDeleteConfirmationState
  let pendingDelete: Promise<void> | null = null

  const publish = (nextState: TaskDeleteConfirmationState) => {
    state = nextState
    onStateChange?.(state)
  }

  return {
    getState() {
      return state
    },
    open() {
      publish({
        isOpen: true,
        isDeleting: false,
        error: '',
      })
    },
    cancel() {
      if (state.isDeleting) return
      publish(initialTaskDeleteConfirmationState)
    },
    confirm() {
      if (!state.isOpen) return
      if (pendingDelete) return pendingDelete

      publish({
        isOpen: true,
        isDeleting: true,
        error: '',
      })

      pendingDelete = executeDelete()
        .then(() => {
          publish(initialTaskDeleteConfirmationState)
        })
        .catch((error) => {
          publish({
            isOpen: true,
            isDeleting: false,
            error: toDeleteErrorMessage(error),
          })
          throw error
        })
        .finally(() => {
          pendingDelete = null
        })
      return pendingDelete
    },
  }
}

export function useTaskDeleteConfirmation(onDelete?: () => Promise<void> | void) {
  const onDeleteRef = useRef(onDelete)
  const [state, setState] = useState(initialTaskDeleteConfirmationState)
  const controllerRef = useRef<ReturnType<typeof createTaskDeleteConfirmationController> | null>(null)

  useEffect(() => {
    onDeleteRef.current = onDelete
  }, [onDelete])

  if (controllerRef.current === null) {
    controllerRef.current = createTaskDeleteConfirmationController(async () => {
      await onDeleteRef.current?.()
    }, setState)
  }

  const openDeleteDialog = useCallback(() => {
    controllerRef.current?.open()
  }, [])

  const closeDeleteDialog = useCallback(() => {
    controllerRef.current?.cancel()
  }, [])

  const confirmDelete = useCallback(async () => {
    await controllerRef.current?.confirm()
  }, [])

  return {
    ...state,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  }
}
