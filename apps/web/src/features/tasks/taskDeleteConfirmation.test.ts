import { describe, expect, it } from 'vitest'
import { createTaskDeleteConfirmationController, initialTaskDeleteConfirmationState } from './taskDeleteConfirmation'

function createDeferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('task delete confirmation controller', () => {
it('opening the dialog marks the confirmation as open', () => {
  const controller = createTaskDeleteConfirmationController(async () => undefined)

  controller.open()

  expect(controller.getState()).toEqual({
    isOpen: true,
    isDeleting: false,
    error: '',
  })
})

it('canceling closes the dialog and clears prior error state', () => {
  const controller = createTaskDeleteConfirmationController(async () => undefined)

  controller.open()
  controller.cancel()

  expect(controller.getState()).toEqual(initialTaskDeleteConfirmationState)
})

it('confirming deletes once and closes after success', async () => {
  let deleteCalls = 0
  const controller = createTaskDeleteConfirmationController(async () => {
    deleteCalls += 1
  })

  controller.open()
  await controller.confirm()

  expect(deleteCalls).toBe(1)
  expect(controller.getState()).toEqual(initialTaskDeleteConfirmationState)
})

it('preventing duplicate deletion reuses the in-flight request', async () => {
  let deleteCalls = 0
  const deferred = createDeferred()
  const controller = createTaskDeleteConfirmationController(async () => {
    deleteCalls += 1
    await deferred.promise
  })

  controller.open()
  const first = controller.confirm()
  const second = controller.confirm()

  expect(deleteCalls).toBe(1)
  expect(first).toBe(second)
  expect(controller.getState()).toEqual({
    isOpen: true,
    isDeleting: true,
    error: '',
  })

  deferred.resolve()
  await first
  expect(controller.getState()).toEqual(initialTaskDeleteConfirmationState)
})

it('showing delete failure keeps the dialog open and exposes the error', async () => {
  const controller = createTaskDeleteConfirmationController(async () => {
    throw new Error('Server said no.')
  })

  controller.open()
  await expect(controller.confirm()).rejects.toThrow('Server said no.')

  expect(controller.getState()).toEqual({
    isOpen: true,
    isDeleting: false,
    error: 'Server said no.',
  })
})
})
