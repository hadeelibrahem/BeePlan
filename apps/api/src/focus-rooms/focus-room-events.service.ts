import { Injectable, type MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, map, merge, timer } from 'rxjs';

export type FocusRoomEvent = {
  id: string;
  roomId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class FocusRoomEventsService {
  private readonly events = new Subject<FocusRoomEvent>();
  publish(event: FocusRoomEvent) {
    this.events.next(event);
  }
  stream(roomId: string): Observable<MessageEvent> {
    const roomEvents = this.events.pipe(
      filter((event) => event.roomId === roomId),
      map(
        (event): MessageEvent => ({
          data: event,
          id: event.id,
          type: event.type,
        }),
      ),
    );
    const resync = timer(30_000, 30_000).pipe(
      map(
        (): MessageEvent => ({
          data: {
            type: 'resync_required',
            roomId,
            occurredAt: new Date().toISOString(),
          },
        }),
      ),
    );
    return merge(roomEvents, resync);
  }
}
