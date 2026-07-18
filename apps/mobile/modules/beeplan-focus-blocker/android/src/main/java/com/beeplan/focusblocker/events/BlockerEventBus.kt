package com.beeplan.focusblocker.events

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Process-wide hot stream of [BlockerEvent]s from the native core to the Expo
 * module. Decouples emitters (service, controller, activity) from the single
 * JS-facing collector, so no component needs a reference to the module.
 *
 * `extraBufferCapacity` lets emitters `tryEmit` without suspending even if the
 * module has not attached its collector yet (e.g. during cold session recovery).
 */
object BlockerEventBus {
  private val _events = MutableSharedFlow<BlockerEvent>(
    replay = 0,
    extraBufferCapacity = 32,
  )
  val events: SharedFlow<BlockerEvent> = _events.asSharedFlow()

  fun emit(event: BlockerEvent) {
    _events.tryEmit(event)
  }
}
