import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FocusRoomsService } from './focus-rooms.service';
@Injectable()
export class FocusRoomsReconciliationWorker {
  private running = false;
  constructor(private readonly rooms: FocusRoomsService) {}
  @Interval(1_000)
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      await this.rooms.reconcilePersistedState();
    } finally {
      this.running = false;
    }
  }
}
