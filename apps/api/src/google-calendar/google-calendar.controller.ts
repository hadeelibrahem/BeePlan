import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(private readonly service: GoogleCalendarService) {}

  @Get('connect') @UseGuards(JwtAuthGuard)
  connect(@Req() req: AuthenticatedRequest, @Query('returnTo') returnTo?: string) { return { url: this.service.getConnectUrl(req.user.id, returnTo) }; }

  @Get('callback')
  async callback(@Query() query: Record<string, string | undefined>, @Res() response: Response) {
    try {
      const returnTo = await this.service.completeConnect(query);
      return response.redirect(returnTo ?? `${this.service.frontendUrl()}/settings?googleCalendar=connected`);
    }
    catch (error) { const message = error instanceof Error ? error.message : 'Google Calendar connection failed'; return response.redirect(`${this.service.frontendUrl()}/settings?googleCalendarError=${encodeURIComponent(message)}`); }
  }

  @Get('status') @UseGuards(JwtAuthGuard)
  status(@Req() req: AuthenticatedRequest) { return this.service.status(req.user.id); }

  @Get('calendars') @UseGuards(JwtAuthGuard)
  calendars(@Req() req: AuthenticatedRequest) { return this.service.listCalendars(req.user.id); }

  @Put('calendars') @UseGuards(JwtAuthGuard)
  selectCalendars(@Req() req: AuthenticatedRequest, @Body() body: { calendarIds: string[] }) { return this.service.selectCalendars(req.user.id, body.calendarIds ?? []); }

  @Post('sync') @UseGuards(JwtAuthGuard)
  sync(@Req() req: AuthenticatedRequest) { return this.service.syncIncremental(req.user.id); }

  @Get('sync-jobs') @UseGuards(JwtAuthGuard)
  syncJobs(@Req() req: AuthenticatedRequest) { return this.service.syncJobs(req.user.id); }

  @Post('sync-jobs/:id/retry') @UseGuards(JwtAuthGuard)
  retryJob(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.service.retryJob(req.user.id, id); }

  @Put('settings') @UseGuards(JwtAuthGuard)
  settings(@Req() req: AuthenticatedRequest, @Body() body: { syncDirection?: 'import_only' | 'export_only' | 'two_way'; defaultReminderMinutes?: number; syncTasks?: boolean; syncFocusSessions?: boolean; syncReminders?: boolean; syncCalendarBlocks?: boolean }) { return this.service.updateSettings(req.user.id, body); }

  @Get('events') @UseGuards(JwtAuthGuard)
  events(@Req() req: AuthenticatedRequest, @Query('from') from?: string, @Query('to') to?: string) { return this.service.events(req.user.id, from, to); }

  @Delete('disconnect') @UseGuards(JwtAuthGuard)
  disconnect(@Req() req: AuthenticatedRequest) { return this.service.disconnect(req.user.id); }
}
