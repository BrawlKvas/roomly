const OFFICE_UTC_OFFSET = '+03:00';

export interface SearchInterval {
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function isTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number) as [number, number];
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function officeDateToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseOfficeDate(value: unknown): string | undefined {
  return isCalendarDate(value) ? value : undefined;
}

export function officeDayRange(date: string): { from: string; to: string } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const from = new Date(Date.UTC(year, month - 1, day, -3));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Validates the common date/time restrictions used by booking creation and search. */
export function validateSearchInterval(
  values: { date?: unknown; start?: unknown; end?: unknown },
  now = new Date(),
): { interval?: SearchInterval; fieldErrors: string[] } {
  const fieldErrors: string[] = [];
  const date = parseOfficeDate(values.date);
  const start = isTime(values.start) ? values.start : undefined;
  const end = isTime(values.end) ? values.end : undefined;

  if (!date) fieldErrors.push('date: Укажите существующую календарную дату');
  if (!start) fieldErrors.push('start: Укажите корректное время начала');
  if (!end) fieldErrors.push('end: Укажите корректное время окончания');
  if (!date || !start || !end) return { fieldErrors };

  const [startHour, startMinute] = start.split(':').map(Number) as [number, number];
  const [endHour, endMinute] = end.split(':').map(Number) as [number, number];
  if (startMinute % 15 !== 0) fieldErrors.push('start: Время должно быть кратно 15 минутам');
  if (endMinute % 15 !== 0) fieldErrors.push('end: Время должно быть кратно 15 минутам');
  if (fieldErrors.length > 0) return { fieldErrors };

  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) fieldErrors.push('date: Бронирование доступно только в рабочие дни');

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  if (endMinutes <= startMinutes) fieldErrors.push('end: Окончание должно быть позже начала');
  if (startMinutes < 8 * 60 || endMinutes > 20 * 60) fieldErrors.push('time: Интервал должен быть в рабочих часах с 08:00 до 20:00');
  if (endMinutes > startMinutes && (endMinutes - startMinutes < 15 || endMinutes - startMinutes > 240)) {
    fieldErrors.push('end: Длительность должна быть от 15 минут до 4 часов');
  }
  if (fieldErrors.length > 0) return { fieldErrors };

  const startsAt = new Date(`${date}T${start}:00.000${OFFICE_UTC_OFFSET}`).toISOString();
  const endsAt = new Date(`${date}T${end}:00.000${OFFICE_UTC_OFFSET}`).toISOString();
  if (new Date(startsAt).getTime() <= now.getTime()) {
    return { fieldErrors: ['start: Начало должно быть строго в будущем'] };
  }
  return { interval: { date, start, end, startsAt, endsAt }, fieldErrors: [] };
}

export function officeTime(instant: string): string {
  return new Date(new Date(instant).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
}
