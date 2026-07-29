import { BadRequestException } from '@nestjs/common';

export function zonedDateTime(
  date: string,
  time: string,
  timezone: string,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new BadRequestException('Scheduled date/time is invalid.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('Invalid IANA timezone.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = zonedParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    guess += wantedAsUtc - actualAsUtc;
  }
  const verified = zonedParts(new Date(guess), timezone);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  )
    throw new BadRequestException(
      'Scheduled local time does not exist in this timezone.',
    );
  return new Date(guess);
}

export function localTimeLabel(value: Date, timezone: string, language = 'en') {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}
