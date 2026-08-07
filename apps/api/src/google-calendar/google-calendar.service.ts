/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable, Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  focusSessions,
  googleCalendarConnections,
  googleCalendarEvents,
  googleCalendars,
  googleCalendarSyncJobs,
  reminders,
  tasks,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  canExportCandidate,
  retryDelayMs,
  type CalendarSyncCandidate,
  type CalendarSyncEntityType,
} from './calendar-sync.contract';

type GoogleEvent = {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: unknown[];
  recurrence?: string[];
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private outboundQueueRunning = false;
  constructor(
    private readonly dbService: DatabaseService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
  ) {}
  private get db() {
    return this.dbService.db;
  }
  private clientId() {
    return (
      this.config.get<string>('GOOGLE_CLIENT_ID') ??
      this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ??
      this.config.get<string>('GOOGLE_WEB_CLIENT_ID')
    );
  }
  private clientSecret() {
    return (
      this.config.get<string>('GOOGLE_CLIENT_SECRET') ??
      this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ??
      this.config.get<string>('GOOGLE_WEB_CLIENT_SECRET')
    );
  }
  private redirectUri() {
    return (
      this.config.get<string>('GOOGLE_CALENDAR_CALLBACK_URL') ??
      `${this.config.get<string>('API_PUBLIC_URL') ?? this.config.get<string>('PUBLIC_BASE_URL') ?? `http://127.0.0.1:${this.config.get<number>('PORT') ?? 3000}`}/google-calendar/callback`
    );
  }
  frontendUrl() {
    return (
      this.config.get<string>('FRONTEND_URL') ??
      this.config.get<string>('WEB_APP_URL') ??
      'http://127.0.0.1:5173'
    );
  }
  getConnectUrl(userId: string, returnTo?: string) {
    const clientId = this.clientId();
    if (!clientId || !this.clientSecret())
      throw new BadRequestException('Google OAuth is not configured.');
    const safeReturnTo = returnTo?.startsWith('beeplan://') ? returnTo : undefined;
    const state = this.jwt.sign(
      { purpose: 'google-calendar-connect', userId, returnTo: safeReturnTo },
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'openid email https://www.googleapis.com/auth/calendar.events',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  async completeConnect(query: Record<string, string | undefined>) {
    if (query.error) throw new BadRequestException(query.error);
    if (!query.code || !query.state)
      throw new BadRequestException(
        'Google Calendar authorization was incomplete.',
      );
    const payload = this.jwt.verify<{ purpose: string; userId: string; returnTo?: string }>(
      query.state,
    );
    if (payload.purpose !== 'google-calendar-connect')
      throw new UnauthorizedException('Invalid calendar authorization state.');
    const token = await this.tokenRequest({
      code: query.code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri(),
    });
    const profile = await this.googleFetch<{ email?: string }>(
      '/oauth2/v3/userinfo',
      token.access_token,
    );
    await this.db
      .insert(googleCalendarConnections)
      .values({
        userId: payload.userId,
        accountEmail: profile.email ?? 'Google account',
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt: new Date(
          Date.now() + (token.expires_in ?? 3600) * 1000,
        ),
        syncDirection: 'two_way',
      })
      .onConflictDoUpdate({
        target: googleCalendarConnections.userId,
        set: {
          accountEmail: profile.email ?? 'Google account',
          accessToken: token.access_token,
          refreshToken: token.refresh_token ?? null,
          tokenExpiresAt: new Date(
            Date.now() + (token.expires_in ?? 3600) * 1000,
          ),
          updatedAt: new Date(),
        },
      });
    await this.syncCalendars(payload.userId);
    if (payload.returnTo?.startsWith('beeplan://')) return payload.returnTo;
  }
  async status(userId: string) {
    const [connection] = await this.db
      .select({
        email: googleCalendarConnections.accountEmail,
        lastSyncedAt: googleCalendarConnections.lastSyncedAt,
        syncDirection: googleCalendarConnections.syncDirection,
        syncTasks: googleCalendarConnections.syncTasks,
        syncFocusSessions: googleCalendarConnections.syncFocusSessions,
        syncReminders: googleCalendarConnections.syncReminders,
        syncCalendarBlocks: googleCalendarConnections.syncCalendarBlocks,
      })
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId))
      .limit(1);
    return connection
      ? { connected: true, ...connection }
      : { connected: false };
  }
  @Cron('*/5 * * * *')
  async syncConnectedAccounts() {
    const connections = await this.db
      .select({ userId: googleCalendarConnections.userId })
      .from(googleCalendarConnections);
    for (const connection of connections) {
      try {
        await this.syncIncremental(connection.userId);
      } catch {
        /* one expired/revoked account must not stop other users syncing */
      }
    }
  }
  /** Called after a BeePlan write. It only persists work; Google is never called in the task transaction. */
  async enqueueTaskSync(
    userId: string,
    taskId: string,
    operation: 'upsert' | 'delete' = 'upsert',
  ) {
    const [connection] = await this.db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId))
      .limit(1);
    if (!connection || connection.syncDirection === 'import_only') return;
    const pending = await this.db
      .select({ id: googleCalendarSyncJobs.id })
      .from(googleCalendarSyncJobs)
      .where(
        and(
          eq(googleCalendarSyncJobs.userId, userId),
          eq(googleCalendarSyncJobs.entityType, 'task'),
          eq(googleCalendarSyncJobs.entityId, taskId),
          eq(googleCalendarSyncJobs.operation, operation),
          eq(googleCalendarSyncJobs.status, 'pending'),
        ),
      )
      .limit(1);
    if (pending[0]) return;
    await this.db
      .insert(googleCalendarSyncJobs)
      .values({
        userId,
        connectionId: connection.id,
        operation,
        entityType: 'task',
        entityId: taskId,
      })
      .onConflictDoNothing();
  }
  async enqueueEntitySync(
    userId: string,
    entityType: CalendarSyncEntityType,
    entityId: string,
    operation: 'upsert' | 'delete' = 'upsert',
  ) {
    const [connection] = await this.db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId))
      .limit(1);
    if (!connection || connection.syncDirection === 'import_only') return;
    const enabled =
      entityType === 'task'
        ? connection.syncTasks
        : entityType === 'focus_session'
          ? connection.syncFocusSessions
          : entityType === 'reminder'
            ? connection.syncReminders
            : connection.syncCalendarBlocks;
    if (!enabled) return;
    await this.db
      .insert(googleCalendarSyncJobs)
      .values({
        userId,
        connectionId: connection.id,
        operation,
        entityType,
        entityId,
      })
      .onConflictDoNothing();
  }
  @Cron('* * * * *')
  async processOutboundQueue() {
    if (this.outboundQueueRunning) return;
    this.outboundQueueRunning = true;
    try {
      await this.processOutboundQueueOnce();
    } catch (error) {
      this.logger.warn(
        `Outbound calendar queue skipped; it will retry next run: ${error instanceof Error ? error.message : 'database error'}`,
      );
    } finally {
      this.outboundQueueRunning = false;
    }
  }

  private async processOutboundQueueOnce() {
    const jobs = await this.db
      .select()
      .from(googleCalendarSyncJobs)
      .where(
        and(
          eq(googleCalendarSyncJobs.status, 'pending'),
          lte(googleCalendarSyncJobs.nextRetryAt, new Date()),
        ),
      )
      .orderBy(asc(googleCalendarSyncJobs.nextRetryAt))
      .limit(25);
    for (const job of jobs) {
      await this.db
        .update(googleCalendarSyncJobs)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(googleCalendarSyncJobs.id, job.id));
      try {
        if (job.operation === 'delete') await this.deleteExportedEvent(job);
        else if (job.entityType === 'task') await this.upsertTaskEvent(job);
        else await this.upsertEntityEvent(job);
        await this.db
          .update(googleCalendarSyncJobs)
          .set({ status: 'done', updatedAt: new Date() })
          .where(eq(googleCalendarSyncJobs.id, job.id));
      } catch (error) {
        const attempt = job.attemptCount + 1;
        const conflict = error instanceof GoogleCalendarConflictError;
        await this.db
          .update(googleCalendarSyncJobs)
          .set({
            status: conflict ? 'conflict' : attempt >= 8 ? 'failed' : 'pending',
            attemptCount: attempt,
            nextRetryAt: new Date(Date.now() + retryDelayMs(attempt)),
            lastError:
              error instanceof Error ? error.message : 'Google sync failed',
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarSyncJobs.id, job.id));
        if (conflict) {
          await this.notifications.createOnce({
            userId: job.userId,
            type: 'calendar_conflict',
            title: 'Calendar sync needs attention',
            body: 'A Google Calendar event changed while BeePlan was updating it.',
            data: { entityType: job.entityType, entityId: job.entityId, route: '/settings', event: 'conflict' },
          }, { entityType: 'calendar_conflict', entityId: job.entityId, triggerAt: new Date(), key: `calendar_conflict:${job.userId}:${job.entityType}:${job.entityId}` });
        }
      }
    }
  }
  async retryJob(userId: string, jobId: string) {
    await this.db
      .update(googleCalendarSyncJobs)
      .set({
        status: 'pending',
        nextRetryAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(googleCalendarSyncJobs.id, jobId),
          eq(googleCalendarSyncJobs.userId, userId),
        ),
      );
    return { queued: true };
  }
  async syncJobs(userId: string) {
    return this.db
      .select()
      .from(googleCalendarSyncJobs)
      .where(eq(googleCalendarSyncJobs.userId, userId))
      .orderBy(desc(googleCalendarSyncJobs.updatedAt))
      .limit(100);
  }
  async listCalendars(userId: string) {
    return this.db
      .select()
      .from(googleCalendars)
      .where(eq(googleCalendars.userId, userId))
      .orderBy(desc(googleCalendars.selected), googleCalendars.summary);
  }
  async selectCalendars(userId: string, ids: string[]) {
    await this.db
      .update(googleCalendars)
      .set({
        selected: false,
        nextSyncToken: null,
        syncStatus: 'idle',
        syncLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendars.userId, userId));
    for (const id of ids)
      await this.db
        .update(googleCalendars)
        .set({
          selected: true,
          nextSyncToken: null,
          syncStatus: 'idle',
          syncLeaseUntil: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(googleCalendars.userId, userId), eq(googleCalendars.id, id)),
        );
    return this.syncIncremental(userId);
  }
  async disconnect(userId: string) {
    await this.db
      .delete(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId));
    return { disconnected: true };
  }
  async updateSettings(
    userId: string,
    input: {
      syncDirection?: 'import_only' | 'export_only' | 'two_way';
      defaultReminderMinutes?: number;
      syncTasks?: boolean;
      syncFocusSessions?: boolean;
      syncReminders?: boolean;
      syncCalendarBlocks?: boolean;
    },
  ) {
    const [row] = await this.db
      .update(googleCalendarConnections)
      .set({
        syncDirection: input.syncDirection ?? 'two_way',
        defaultReminderMinutes: input.defaultReminderMinutes ?? 10,
        syncTasks: input.syncTasks ?? true,
        syncFocusSessions: input.syncFocusSessions ?? true,
        syncReminders: input.syncReminders ?? false,
        syncCalendarBlocks: input.syncCalendarBlocks ?? true,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.userId, userId))
      .returning({
        syncDirection: googleCalendarConnections.syncDirection,
        defaultReminderMinutes:
          googleCalendarConnections.defaultReminderMinutes,
        syncTasks: googleCalendarConnections.syncTasks,
        syncFocusSessions: googleCalendarConnections.syncFocusSessions,
        syncReminders: googleCalendarConnections.syncReminders,
        syncCalendarBlocks: googleCalendarConnections.syncCalendarBlocks,
      });
    return row;
  }
  async events(userId: string, from?: string, to?: string) {
    const filters = [eq(googleCalendarEvents.userId, userId)];
    if (from) filters.push(gte(googleCalendarEvents.startAt, new Date(from)));
    if (to) filters.push(lte(googleCalendarEvents.startAt, new Date(to)));
    return this.db
      .select()
      .from(googleCalendarEvents)
      .where(and(...filters))
      .orderBy(googleCalendarEvents.startAt);
  }
  async sync(userId: string) {
    const calendars = await this.syncCalendars(userId);
    const selected = calendars.filter((c) => c.selected);
    let imported = 0;
    for (const calendar of selected) {
      const response = await this.googleFetch<{ items?: GoogleEvent[] }>(
        `/calendar/v3/calendars/${encodeURIComponent(calendar.externalId)}/events?singleEvents=false&showDeleted=true&maxResults=2500&timeMin=${encodeURIComponent(new Date(Date.now() - 90 * 86400000).toISOString())}&timeMax=${encodeURIComponent(new Date(Date.now() + 365 * 86400000).toISOString())}`,
        userId,
      );
      for (const event of response.items ?? []) {
        const existing = await this.db
          .select({ id: googleCalendarEvents.id })
          .from(googleCalendarEvents)
          .where(
            and(
              eq(googleCalendarEvents.userId, userId),
              eq(
                googleCalendarEvents.externalId,
                `${calendar.externalId}:${event.id}`,
              ),
            ),
          )
          .limit(1);
        if (event.status === 'cancelled') {
          if (existing[0])
            await this.db
              .delete(googleCalendarEvents)
              .where(eq(googleCalendarEvents.id, existing[0].id));
          continue;
        }
        const mapped = this.mapEvent(
          userId,
          calendar.id,
          event,
          calendar.externalId,
        );
        if (existing[0])
          await this.db
            .update(googleCalendarEvents)
            .set(mapped)
            .where(eq(googleCalendarEvents.id, existing[0].id));
        else await this.db.insert(googleCalendarEvents).values(mapped);
        imported++;
      }
    }
    await this.db
      .update(googleCalendarConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(googleCalendarConnections.userId, userId));
    return {
      synced: true,
      calendars: selected.length,
      imported,
      lastSyncedAt: new Date().toISOString(),
    };
  }
  private async syncCalendars(userId: string) {
    const token = await this.connectionToken(userId);
    const response = await this.googleFetch<{
      items?: Array<{
        id: string;
        summary?: string;
        description?: string;
        timeZone?: string;
        backgroundColor?: string;
      }>;
    }>('/calendar/v3/users/me/calendarList?minAccessRole=reader', token);
    for (const item of response.items ?? []) {
      await this.db
        .insert(googleCalendars)
        .values({
          userId,
          externalId: item.id,
          summary: item.summary ?? item.id,
          description: item.description ?? null,
          timezone: item.timeZone ?? null,
          color: item.backgroundColor ?? null,
          selected: false,
        })
        .onConflictDoUpdate({
          target: [googleCalendars.userId, googleCalendars.externalId],
          set: {
            summary: item.summary ?? item.id,
            description: item.description ?? null,
            timezone: item.timeZone ?? null,
            color: item.backgroundColor ?? null,
            updatedAt: new Date(),
          },
        });
    }
    return this.db
      .select()
      .from(googleCalendars)
      .where(eq(googleCalendars.userId, userId));
  }
  private mapEvent(
    userId: string,
    calendarId: string,
    event: GoogleEvent,
    externalCalendarId: string,
  ) {
    const allDay = Boolean(event.start?.date);
    return {
      userId,
      calendarId,
      externalId: `${externalCalendarId}:${event.id}`,
      recurringEventId: event.recurringEventId ?? null,
      etag: event.etag ?? null,
      status: 'synced',
      title: event.summary ?? '(Untitled event)',
      description: event.description ?? null,
      location: event.location ?? null,
      startAt: allDay
        ? new Date(`${event.start?.date}T00:00:00Z`)
        : new Date(event.start?.dateTime ?? Date.now()),
      endAt: allDay
        ? new Date(`${event.end?.date}T00:00:00Z`)
        : new Date(event.end?.dateTime ?? Date.now()),
      allDay,
      timezone: event.start?.timeZone ?? null,
      payload: event,
      updatedAt: new Date(),
    } as const;
  }
  private async connectionToken(userId: string) {
    const [connection] = await this.db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId))
      .limit(1);
    if (!connection)
      throw new BadRequestException('Google Calendar is not connected.');
    if (
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() < Date.now() + 60_000 &&
      connection.refreshToken
    ) {
      const token = await this.tokenRequest({
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
      });
      await this.db
        .update(googleCalendarConnections)
        .set({
          accessToken: token.access_token,
          tokenExpiresAt: new Date(
            Date.now() + (token.expires_in ?? 3600) * 1000,
          ),
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.userId, userId));
      return token.access_token;
    }
    return connection.accessToken;
  }
  private async tokenRequest(body: Record<string, string>) {
    const result = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...body,
        client_id: this.clientId() ?? '',
        client_secret: this.clientSecret() ?? '',
      }),
    });
    if (!result.ok)
      throw new BadRequestException('Google token exchange failed.');
    return result.json() as Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>;
  }
  private async upsertTaskEvent(
    job: typeof googleCalendarSyncJobs.$inferSelect,
  ) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, job.entityId), eq(tasks.userId, job.userId)))
      .limit(1);
    if (
      !task?.scheduledDate ||
      !task.scheduledStartTime ||
      !task.scheduledEndTime
    )
      return this.deleteExportedEvent(job);
    const [calendar] = await this.db
      .select()
      .from(googleCalendars)
      .where(
        and(
          eq(googleCalendars.userId, job.userId),
          eq(googleCalendars.selected, true),
        ),
      )
      .orderBy(desc(googleCalendars.updatedAt))
      .limit(1);
    if (!calendar)
      throw new BadRequestException('No selected Google destination calendar.');
    const [mapping] = await this.db
      .select()
      .from(googleCalendarEvents)
      .where(
        and(
          eq(googleCalendarEvents.userId, job.userId),
          eq(googleCalendarEvents.beeplanEntityType, 'task'),
          eq(googleCalendarEvents.beeplanEntityId, task.id),
          eq(googleCalendarEvents.ownership, 'beeplan_exported'),
        ),
      )
      .limit(1);
    const body = {
      summary: task.title,
      description: `${task.description ?? ''}\n\nBeePlan task · ${task.status}`,
      location: (task.destination as { displayName?: string } | null)
        ?.displayName,
      start: {
        dateTime: `${task.scheduledDate}T${task.scheduledStartTime}:00`,
        timeZone: 'UTC',
      },
      end: {
        dateTime: `${task.scheduledDate}T${task.scheduledEndTime}:00`,
        timeZone: 'UTC',
      },
      extendedProperties: {
        private: { beeplanEntityType: 'task', beeplanEntityId: task.id },
      },
    };
    const token = await this.connectionToken(job.userId);
    let response: GoogleEvent;
    if (!mapping?.googleEventId)
      response = await this.googleRequest(
        'POST',
        `/calendar/v3/calendars/${encodeURIComponent(calendar.externalId)}/events`,
        token,
        body,
      );
    else {
      const remote = await this.googleRequest<GoogleEvent>(
        'GET',
        `/calendar/v3/calendars/${encodeURIComponent(mapping.googleCalendarExternalId ?? calendar.externalId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        token,
      );
      if (mapping.etag && remote.etag && mapping.etag !== remote.etag) {
        await this.db
          .update(googleCalendarEvents)
          .set({
            status: 'conflict',
            payload: {
              beeplan: body,
              google: remote,
              reason: 'Google event changed since last BeePlan sync',
            },
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarEvents.id, mapping.id));
        throw new GoogleCalendarConflictError(
          'Google event changed externally.',
        );
      }
      response = await this.googleRequest(
        'PATCH',
        `/calendar/v3/calendars/${encodeURIComponent(mapping.googleCalendarExternalId ?? calendar.externalId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        token,
        body,
      );
    }
    const event = response;
    const mapped = this.mapEvent(
      job.userId,
      calendar.id,
      event,
      calendar.externalId,
    );
    await this.db
      .insert(googleCalendarEvents)
      .values({
        ...mapped,
        externalId: `beeplan:task:${task.id}`,
        googleCalendarExternalId: calendar.externalId,
        googleEventId: event.id,
        ownership: 'beeplan_exported',
        beeplanEntityType: 'task',
        beeplanEntityId: task.id,
        lastGoogleUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [googleCalendarEvents.userId, googleCalendarEvents.externalId],
        set: {
          ...mapped,
          googleCalendarExternalId: calendar.externalId,
          googleEventId: event.id,
          ownership: 'beeplan_exported',
          beeplanEntityType: 'task',
          beeplanEntityId: task.id,
          lastGoogleUpdatedAt: new Date(),
          status: 'synced',
        },
      });
  }
  private async deleteExportedEvent(
    job: typeof googleCalendarSyncJobs.$inferSelect,
  ) {
    const [mapping] = await this.db
      .select()
      .from(googleCalendarEvents)
      .where(
        and(
          eq(googleCalendarEvents.userId, job.userId),
          eq(googleCalendarEvents.beeplanEntityType, job.entityType),
          eq(googleCalendarEvents.beeplanEntityId, job.entityId),
          eq(googleCalendarEvents.ownership, 'beeplan_exported'),
        ),
      )
      .limit(1);
    if (!mapping) return;
    if (mapping.googleEventId && mapping.googleCalendarExternalId) {
      const token = await this.connectionToken(job.userId);
      await this.googleRequest(
        'DELETE',
        `/calendar/v3/calendars/${encodeURIComponent(mapping.googleCalendarExternalId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        token,
      );
    }
    await this.db
      .update(googleCalendarEvents)
      .set({ ownership: 'detached', status: 'synced', updatedAt: new Date() })
      .where(eq(googleCalendarEvents.id, mapping.id));
  }
  private async googleRequest<T = GoogleEvent>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const result = await fetch(`https://www.googleapis.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (result.status === 404 && method === 'DELETE') return {} as T;
    if (!result.ok) {
      const text = await result.text();
      throw new BadRequestException(
        `Google Calendar request failed (${result.status}): ${text.slice(0, 200)}`,
      );
    }
    return (result.status === 204 ? {} : await result.json()) as T;
  }
  private async googleFetch<T>(
    path: string,
    tokenOrUserId: string,
  ): Promise<T> {
    const token = tokenOrUserId.startsWith('ya29.')
      ? tokenOrUserId
      : await this.connectionToken(tokenOrUserId);
    return this.googleRequest<T>('GET', path, token);
  }
  private async loadCandidate(
    userId: string,
    entityType: CalendarSyncEntityType,
    entityId: string,
  ): Promise<CalendarSyncCandidate | null> {
    if (entityType === 'focus_session') {
      const [row] = await this.db
        .select()
        .from(focusSessions)
        .where(
          and(eq(focusSessions.id, entityId), eq(focusSessions.userId, userId)),
        )
        .limit(1);
      if (!row) return null;
      const eligible = row.status !== 'active' && row.status !== 'paused';
      return {
        entityType,
        entityId,
        userId,
        title: 'Focus session',
        description: row.notes,
        startDateTime: eligible ? row.startedAt : null,
        endDateTime: eligible
          ? (row.endsAt ??
            new Date(row.startedAt.getTime() + row.plannedMinutes * 60000))
          : null,
        timezone: 'UTC',
        allDay: false,
        status: row.status,
        syncEligible: eligible,
        source: 'focus',
        updatedAt: row.createdAt,
      };
    }
    if (entityType === 'reminder') {
      const [row] = await this.db
        .select()
        .from(reminders)
        .where(and(eq(reminders.id, entityId), eq(reminders.userId, userId)))
        .limit(1);
      if (!row) return null;
      const eligible = row.type === 'time' && Boolean(row.triggerDateTime);
      return {
        entityType,
        entityId,
        userId,
        title: `Reminder: ${row.title}`,
        description: row.notes,
        startDateTime: eligible ? row.triggerDateTime : null,
        endDateTime:
          eligible && row.triggerDateTime
            ? new Date(row.triggerDateTime.getTime() + 30 * 60000)
            : null,
        timezone: 'UTC',
        allDay: false,
        status: row.status,
        syncEligible: eligible,
        source: 'reminder',
        updatedAt: row.updatedAt,
      };
    }
    return null;
  }
  private async upsertEntityEvent(
    job: typeof googleCalendarSyncJobs.$inferSelect,
  ) {
    const candidate = await this.loadCandidate(
      job.userId,
      job.entityType as CalendarSyncEntityType,
      job.entityId,
    );
    if (!candidate || !canExportCandidate(candidate))
      return this.deleteExportedEvent(job);
    const [calendar] = await this.db
      .select()
      .from(googleCalendars)
      .where(
        and(
          eq(googleCalendars.userId, job.userId),
          eq(googleCalendars.selected, true),
        ),
      )
      .orderBy(desc(googleCalendars.updatedAt))
      .limit(1);
    if (!calendar)
      throw new BadRequestException('No selected Google destination calendar.');
    const [mapping] = await this.db
      .select()
      .from(googleCalendarEvents)
      .where(
        and(
          eq(googleCalendarEvents.userId, job.userId),
          eq(googleCalendarEvents.beeplanEntityType, candidate.entityType),
          eq(googleCalendarEvents.beeplanEntityId, candidate.entityId),
          eq(googleCalendarEvents.ownership, 'beeplan_exported'),
        ),
      )
      .limit(1);
    const body = {
      summary: candidate.title,
      description: candidate.description ?? `${candidate.source} · BeePlan`,
      start: {
        dateTime: candidate.startDateTime?.toISOString(),
        timeZone: candidate.timezone,
      },
      end: {
        dateTime: candidate.endDateTime?.toISOString(),
        timeZone: candidate.timezone,
      },
      extendedProperties: {
        private: {
          beeplanEntityType: candidate.entityType,
          beeplanEntityId: candidate.entityId,
        },
      },
    };
    const token = await this.connectionToken(job.userId);
    let event: GoogleEvent;
    if (!mapping?.googleEventId)
      event = await this.googleRequest(
        'POST',
        `/calendar/v3/calendars/${encodeURIComponent(calendar.externalId)}/events`,
        token,
        body,
      );
    else {
      const remote = await this.googleRequest<GoogleEvent>(
        'GET',
        `/calendar/v3/calendars/${encodeURIComponent(mapping.googleCalendarExternalId ?? calendar.externalId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        token,
      );
      if (mapping.etag && remote.etag && mapping.etag !== remote.etag)
        throw new GoogleCalendarConflictError(
          'Google event changed externally.',
        );
      event = await this.googleRequest(
        'PATCH',
        `/calendar/v3/calendars/${encodeURIComponent(mapping.googleCalendarExternalId ?? calendar.externalId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        token,
        body,
      );
    }
    const mapped = this.mapEvent(
      job.userId,
      calendar.id,
      event,
      calendar.externalId,
    );
    await this.db
      .insert(googleCalendarEvents)
      .values({
        ...mapped,
        externalId: `beeplan:${candidate.entityType}:${candidate.entityId}`,
        connectionId: job.connectionId,
        googleCalendarExternalId: calendar.externalId,
        googleEventId: event.id,
        ownership: 'beeplan_exported',
        beeplanEntityType: candidate.entityType,
        beeplanEntityId: candidate.entityId,
        lastGoogleUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [googleCalendarEvents.userId, googleCalendarEvents.externalId],
        set: {
          ...mapped,
          connectionId: job.connectionId,
          googleCalendarExternalId: calendar.externalId,
          googleEventId: event.id,
          ownership: 'beeplan_exported',
          beeplanEntityType: candidate.entityType,
          beeplanEntityId: candidate.entityId,
          lastGoogleUpdatedAt: new Date(),
          status: 'synced',
        },
      });
  }
  async syncIncremental(userId: string) {
    const calendars = await this.syncCalendars(userId);
    const results: Array<{
      calendarId: string;
      status: string;
      created?: number;
      updated?: number;
      cancelled?: number;
      error?: string;
    }> = [];
    for (const calendar of calendars.filter((item) => item.selected)) {
      try {
        results.push(await this.syncOneCalendar(userId, calendar.id));
      } catch (error) {
        results.push({
          calendarId: calendar.id,
          status: 'failed',
          error:
            error instanceof Error ? error.message : 'Calendar sync failed',
        });
      }
    }
    return {
      synced: true,
      calendars: results,
      lastSyncedAt: new Date().toISOString(),
    };
  }
  private async syncOneCalendar(
    userId: string,
    calendarId: string,
  ): Promise<{
    calendarId: string;
    status: string;
    created: number;
    updated: number;
    cancelled: number;
  }> {
    const lease = new Date(Date.now() + 2 * 60 * 1000);
    const [calendar] = await this.db
      .update(googleCalendars)
      .set({
        syncStatus: 'running',
        syncLeaseUntil: lease,
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(googleCalendars.id, calendarId),
          eq(googleCalendars.userId, userId),
          eq(googleCalendars.selected, true),
          lte(googleCalendars.syncLeaseUntil, new Date()),
        ),
      )
      .returning();
    if (!calendar)
      return {
        calendarId,
        status: 'skipped',
        created: 0,
        updated: 0,
        cancelled: 0,
      };
    let full = !calendar.nextSyncToken;
    let token = calendar.nextSyncToken ?? undefined;
    let pageToken: string | undefined;
    let created = 0;
    let updated = 0;
    let cancelled = 0;
    try {
      while (true) {
        let page: {
          items?: GoogleEvent[];
          nextPageToken?: string;
          nextSyncToken?: string;
        };
        try {
          page = await this.eventsPage(
            userId,
            calendar.externalId,
            token,
            pageToken,
            full,
          );
        } catch (error) {
          if (error instanceof GoogleSyncTokenExpired) {
            await this.db
              .update(googleCalendars)
              .set({
                nextSyncToken: null,
                syncStatus: 'idle',
                syncLeaseUntil: null,
                updatedAt: new Date(),
              })
              .where(eq(googleCalendars.id, calendar.id));
            return this.syncOneCalendar(userId, calendar.id);
          }
          throw error;
        }
        for (const event of page.items ?? []) {
          const result = await this.reconcileImportedEvent(
            userId,
            calendar,
            event,
          );
          await this.notifyImportedEventChange(userId, calendar, event, result);
          created += result === 'created' ? 1 : 0;
          updated += result === 'updated' ? 1 : 0;
          cancelled += result === 'cancelled' ? 1 : 0;
        }
        if (!page.nextPageToken) {
          token = page.nextSyncToken;
          break;
        }
        pageToken = page.nextPageToken;
      }
      if (!token)
        throw new Error(
          'Google did not return a nextSyncToken after complete sync.',
        );
      await this.db
        .update(googleCalendars)
        .set({
          nextSyncToken: token,
          lastSuccessfulSyncAt: new Date(),
          lastFullSyncAt: full ? new Date() : calendar.lastFullSyncAt,
          syncStatus: 'idle',
          syncLeaseUntil: null,
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendars.id, calendar.id));
      return {
        calendarId,
        status: full ? 'full' : 'incremental',
        created,
        updated,
        cancelled,
      };
    } catch (error) {
      await this.db
        .update(googleCalendars)
        .set({
          syncStatus: 'failed',
          syncLeaseUntil: null,
          lastSyncError:
            error instanceof Error ? error.message : 'Calendar sync failed',
          updatedAt: new Date(),
        })
        .where(eq(googleCalendars.id, calendar.id));
      throw error;
    }
  }
  private async eventsPage(
    userId: string,
    calendarId: string,
    syncToken?: string,
    pageToken?: string,
    full = false,
  ) {
    const token = await this.connectionToken(userId);
    const params = new URLSearchParams({
      showDeleted: 'true',
      singleEvents: 'false',
      maxResults: '2500',
    });
    if (syncToken) params.set('syncToken', syncToken);
    else if (full)
      params.set(
        'timeMin',
        new Date(Date.now() - 365 * 86400000).toISOString(),
      );
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (response.status === 410) throw new GoogleSyncTokenExpired();
    if (!response.ok)
      throw new BadRequestException(
        `Google Calendar sync failed (${response.status}).`,
      );
    return response.json() as Promise<{
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>;
  }
  private async reconcileImportedEvent(
    userId: string,
    calendar: typeof googleCalendars.$inferSelect,
    event: GoogleEvent,
  ): Promise<'created' | 'updated' | 'cancelled'> {
    const externalId = `${calendar.externalId}:${event.id}`;
    let [existing] = await this.db
      .select()
      .from(googleCalendarEvents)
      .where(
        and(
          eq(googleCalendarEvents.userId, userId),
          eq(googleCalendarEvents.externalId, externalId),
        ),
      )
      .limit(1);
    if (!existing && event.id) {
      [existing] = await this.db
        .select()
        .from(googleCalendarEvents)
        .where(
          and(
            eq(googleCalendarEvents.userId, userId),
            eq(googleCalendarEvents.googleEventId, event.id),
          ),
        )
        .limit(1);
    }
    if (event.status === 'cancelled') {
      if (existing && existing.ownership === 'google_imported')
        await this.db
          .update(googleCalendarEvents)
          .set({ status: 'deleted', updatedAt: new Date() })
          .where(eq(googleCalendarEvents.id, existing.id));
      return 'cancelled';
    }
    const mapped = this.mapEvent(
      userId,
      calendar.id,
      event,
      calendar.externalId,
    );
    const values = {
      ...mapped,
      connectionId: calendar.connectionId,
      googleCalendarExternalId: calendar.externalId,
      googleEventId: event.id,
      ownership: existing?.ownership ?? 'google_imported',
      beeplanEntityType: existing?.beeplanEntityType ?? null,
      beeplanEntityId: existing?.beeplanEntityId ?? null,
      lastGoogleUpdatedAt: new Date(),
    };
    if (existing) {
      await this.db
        .update(googleCalendarEvents)
        .set(values)
        .where(eq(googleCalendarEvents.id, existing.id));
      return 'updated';
    }
    await this.db.insert(googleCalendarEvents).values(values);
    return 'created';
  }

  private async notifyImportedEventChange(
    userId: string,
    calendar: typeof googleCalendars.$inferSelect,
    event: GoogleEvent,
    result: 'created' | 'updated' | 'cancelled',
  ) {
    const externalId = `${calendar.externalId}:${event.id}`;
    const [row] = await this.db
      .select()
      .from(googleCalendarEvents)
      .where(and(eq(googleCalendarEvents.userId, userId), eq(googleCalendarEvents.externalId, externalId)))
      .limit(1);
    const entityId = row?.id ?? externalId;
    const triggerAt = event.start?.dateTime ? new Date(event.start.dateTime) : new Date();
    const version = event.etag ?? event.id;
    const type = result === 'created' ? 'calendar_event_created' : result === 'updated' ? 'calendar_event_updated' : 'calendar_event_cancelled';
    const title = row?.title ?? event.summary ?? 'Calendar event';
    await this.notifications.createOnce({
      userId,
      type,
      title: result === 'created' ? 'Calendar event imported' : result === 'updated' ? 'Calendar event changed' : 'Calendar event cancelled',
      body: result === 'cancelled' ? `"${title}" was cancelled in Google Calendar.` : `"${title}" ${result === 'created' ? 'was added from Google Calendar.' : 'changed in Google Calendar.'}`,
      data: { entityType: 'calendar_event', entityId, route: `/calendar?event=${entityId}`, event: result },
    }, { entityType: `calendar_event_${result}`, entityId, triggerAt, key: `calendar_event:${userId}:${entityId}:${result}:${version}` });
  }
}

class GoogleCalendarConflictError extends Error {}
class GoogleSyncTokenExpired extends Error {}
