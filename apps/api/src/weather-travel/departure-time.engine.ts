import { Injectable } from '@nestjs/common';
import { zonedDateTime } from './zoned-time';

@Injectable()
export class DepartureTimeEngine {
  calculate(input: {
    scheduledDate: string;
    scheduledStartTime: string;
    timezone: string;
    routeDurationMinutes: number;
    preparationBufferMinutes: number;
    parkingWalkingBufferMinutes: number;
    uncertaintyBufferMinutes: number;
  }) {
    const scheduledStart = zonedDateTime(
      input.scheduledDate,
      input.scheduledStartTime,
      input.timezone,
    );
    const totalLeadMinutes =
      input.routeDurationMinutes +
      input.preparationBufferMinutes +
      input.parkingWalkingBufferMinutes +
      input.uncertaintyBufferMinutes;
    return {
      scheduledStart,
      totalLeadMinutes,
      recommendedDeparture: new Date(
        scheduledStart.getTime() - totalLeadMinutes * 60_000,
      ),
    };
  }
  notificationTime(
    recommendedDeparture: Date | null,
    scheduledStart: Date,
    weatherLeadMinutes: number,
  ) {
    return new Date(
      (recommendedDeparture ?? scheduledStart).getTime() -
        weatherLeadMinutes * 60_000,
    );
  }
}
