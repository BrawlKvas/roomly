const OFFICE_OFFSET = '+03:00';
const WHITESPACE_CODE_POINTS = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
  0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
const LINE_BREAK_CODE_POINTS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);

export interface BookingInterval {
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
}

export function normalizeText(value: unknown, options: { singleLine?: boolean } = {}): string | undefined {
  if (typeof value !== 'string') return undefined;
  const characters = Array.from(value);
  if (options.singleLine && characters.some((character) => LINE_BREAK_CODE_POINTS.has(character.codePointAt(0)!))) return undefined;
  let first = 0;
  let last = characters.length;
  while (first < last && WHITESPACE_CODE_POINTS.has(characters[first]!.codePointAt(0)!)) first += 1;
  while (last > first && WHITESPACE_CODE_POINTS.has(characters[last - 1]!.codePointAt(0)!)) last -= 1;
  return characters.slice(first, last).join('');
}

export function unicodeLength(value: string): number {
  return Array.from(value).length;
}

export function parseInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return undefined;
  return value;
}

export function parseCalendarDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day ? value : undefined;
}

export function parseTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return undefined;
  const [hours, minutes] = value.split(':').map(Number) as [number, number];
  return hours < 24 && minutes < 60 ? value : undefined;
}

export function isWorkingDay(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function toOfficeInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00.000${OFFICE_OFFSET}`).toISOString();
}

export function officeDate(instant: string | Date = new Date()): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function officeTime(instant: string): string {
  return new Date(new Date(instant).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

export function validateBookingInterval(values: { date?: unknown; start?: unknown; end?: unknown }, now = new Date()): { interval?: BookingInterval; errors: string[] } {
  const errors: string[] = [];
  const date = parseCalendarDate(values.date);
  const start = parseTime(values.start);
  const end = parseTime(values.end);
  if (!date) errors.push('date: Укажите существующую календарную дату');
  if (!start) errors.push('start: Укажите корректное время начала');
  if (!end) errors.push('end: Укажите корректное время окончания');
  if (!date || !start || !end) return { errors };
  const [startHour, startMinute] = start.split(':').map(Number) as [number, number];
  const [endHour, endMinute] = end.split(':').map(Number) as [number, number];
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  if (!isWorkingDay(date)) errors.push('date: Бронирование доступно только в рабочие дни');
  if (startMinute % 15 !== 0) errors.push('start: Время должно быть кратно 15 минутам');
  if (endMinute % 15 !== 0) errors.push('end: Время должно быть кратно 15 минутам');
  if (endMinutes <= startMinutes) errors.push('end: Окончание должно быть позже начала');
  if (startMinutes < 480 || endMinutes > 1200) errors.push('time: Интервал должен быть в рабочих часах с 08:00 до 20:00');
  if (endMinutes > startMinutes && (endMinutes - startMinutes < 15 || endMinutes - startMinutes > 240)) errors.push('end: Длительность должна быть от 15 минут до 4 часов');
  if (errors.length > 0) return { errors };
  const startsAt = toOfficeInstant(date, start);
  const endsAt = toOfficeInstant(date, end);
  if (Date.parse(startsAt) <= now.getTime()) return { errors: ['start: Начало должно быть строго в будущем'] };
  return { interval: { date, start, end, startsAt, endsAt }, errors: [] };
}

export function intervalsOverlap(existing: { startsAt: string; endsAt: string }, requested: { startsAt: string; endsAt: string }): boolean {
  return existing.startsAt < requested.endsAt && requested.startsAt < existing.endsAt;
}
