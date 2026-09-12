import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { intervalsOverlap, normalizeText, officeDate, officeTime, parseCalendarDate, parseInteger, unicodeLength, validateBookingInterval, type BookingInterval } from './booking-domain';

type RoomStatus = 'available' | 'unavailable';
type BookingStatus = 'scheduled' | 'completed' | 'cancelled';

interface RoomRow {
  id: string;
  name: string;
  floor: number;
  location: string;
  capacity: number;
  description: string | null;
  status: RoomStatus;
}

interface BookingRow {
  id: string;
  owner_id: string;
  room_id: string;
  subject: string;
  description: string | null;
  participants: number;
  starts_at: string;
  ends_at: string;
  version: number;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_type: 'owner' | 'admin' | null;
  cancellation_reason: string | null;
  cancellation_actor_name: string | null;
  cancellation_actor_email: string | null;
  cancellation_actor_role: 'employee' | 'admin' | null;
  owner_name: string;
  owner_email: string;
  room_name: string;
  room_floor: number;
  room_location: string;
  room_capacity: number;
  room_status: RoomStatus;
}

interface ValidatedFields {
  roomId: string;
  subject: string;
  description: string | null;
  participants: number;
  interval: BookingInterval;
}

const BOOKING_FIELDS = new Set(['roomId', 'subject', 'description', 'participants', 'date', 'start', 'end']);

@Injectable()
export class BookingsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  create(values: Record<string, unknown>, user: AuthenticatedUser) {
    this.ensureFields(values, BOOKING_FIELDS);
    return this.immediate(() => {
      const fields = this.validateFields(values);
      const room = this.findRoom(fields.roomId);
      this.validateRoom(room, fields);
      this.ensureFree(fields.roomId, fields.interval);
      const now = new Date().toISOString();
      const id = randomUUID();
      this.database.sqlite.prepare(
        `insert into bookings (id, owner_id, room_id, subject, description, participants, starts_at, ends_at, version, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(id, user.id, fields.roomId, fields.subject, fields.description, fields.participants, fields.interval.startsAt, fields.interval.endsAt, now, now);
      return this.detailInTransaction(id, user);
    });
  }

  listMine(query: Record<string, unknown>, user: AuthenticatedUser) {
    const allowed = new Set(['view', 'status', 'dateFrom', 'dateTo']);
    this.ensureFields(query, allowed, 'Переданы неподдерживаемые параметры списка');
    const view = query.view === undefined ? 'upcoming' : query.view;
    const status = query.status === undefined ? 'all' : query.status;
    if (typeof view !== 'string' || !['upcoming', 'current', 'past', 'cancelled', 'all'].includes(view)) throw this.fieldError('view: Укажите известное представление');
    if (typeof status !== 'string' || !['all', 'scheduled', 'completed', 'cancelled'].includes(status)) throw this.fieldError('status: Укажите известный статус');
    const dateFrom = query.dateFrom === undefined || query.dateFrom === '' ? undefined : parseCalendarDate(query.dateFrom);
    const dateTo = query.dateTo === undefined || query.dateTo === '' ? undefined : parseCalendarDate(query.dateTo);
    const errors: string[] = [];
    if (query.dateFrom !== undefined && query.dateFrom !== '' && !dateFrom) errors.push('dateFrom: Укажите существующую календарную дату');
    if (query.dateTo !== undefined && query.dateTo !== '' && !dateTo) errors.push('dateTo: Укажите существующую календарную дату');
    if (dateFrom && dateTo && dateFrom > dateTo) errors.push('dateTo: Конец периода не может быть раньше начала');
    if (errors.length) throw this.fieldError(...errors);
    const rows = this.selectBookings('where bookings.owner_id = ?', [user.id]);
    const now = Date.now();
    const filtered = rows.filter((row) => {
      const state = this.status(row, now);
      if (status !== 'all' && state !== status) return false;
      const date = officeDate(row.starts_at);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      if (view === 'upcoming') return state === 'scheduled' && Date.parse(row.starts_at) > now;
      if (view === 'current') return state === 'scheduled' && Date.parse(row.starts_at) <= now && now < Date.parse(row.ends_at);
      if (view === 'past') return state === 'completed';
      if (view === 'cancelled') return state === 'cancelled';
      return true;
    });
    const ascending = view === 'upcoming' || view === 'current';
    filtered.sort((left, right) => {
      const difference = Date.parse(left.starts_at) - Date.parse(right.starts_at);
      if (difference !== 0) return ascending ? difference : -difference;
      return left.id.localeCompare(right.id, 'en', { sensitivity: 'variant' });
    });
    return filtered.map((row) => this.toSummary(row, now));
  }

  upcoming(user: AuthenticatedUser) {
    const now = Date.now();
    return this.selectBookings('where bookings.owner_id = ?', [user.id])
      .filter((row) => row.cancelled_at === null && Date.parse(row.ends_at) > now)
      .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at) || left.id.localeCompare(right.id, 'en', { sensitivity: 'variant' }))
      .slice(0, 5)
      .map((row) => this.toSummary(row, now));
  }

  listAll(query: Record<string, unknown>, user: AuthenticatedUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Недостаточно прав для выполнения операции');
    this.ensureFields(query, new Set(['roomId', 'ownerId', 'date', 'dateFrom', 'dateTo', 'status']), 'Переданы неподдерживаемые параметры списка');
    const status = query.status === undefined || query.status === '' ? 'all' : query.status;
    const date = query.date === undefined || query.date === '' ? undefined : parseCalendarDate(query.date);
    const dateFrom = date ?? (query.dateFrom === undefined || query.dateFrom === '' ? undefined : parseCalendarDate(query.dateFrom));
    const dateTo = date ?? (query.dateTo === undefined || query.dateTo === '' ? undefined : parseCalendarDate(query.dateTo));
    const errors: string[] = [];
    if (query.date !== undefined && query.date !== '' && !date) errors.push('date: Укажите существующую календарную дату');
    if (query.dateFrom !== undefined && query.dateFrom !== '' && !dateFrom) errors.push('dateFrom: Укажите существующую календарную дату');
    if (query.dateTo !== undefined && query.dateTo !== '' && !dateTo) errors.push('dateTo: Укажите существующую календарную дату');
    if (dateFrom && dateTo && dateFrom > dateTo) errors.push('dateTo: Конец периода не может быть раньше начала');
    if (typeof status !== 'string' || !['all', 'scheduled', 'completed', 'cancelled'].includes(status)) errors.push('status: Укажите известный статус');
    if (query.roomId !== undefined && (typeof query.roomId !== 'string' || !this.findRoom(query.roomId))) errors.push('roomId: Комната не найдена');
    if (query.ownerId !== undefined && (typeof query.ownerId !== 'string' || !this.database.sqlite.prepare('select id from users where id=?').get(query.ownerId))) errors.push('ownerId: Владелец не найден');
    if (errors.length) throw this.fieldError(...errors);
    const now = Date.now();
    return this.selectBookings('where 1=1', []).filter((row) => {
      const state = this.status(row, now); const startDate = officeDate(row.starts_at);
      return (query.roomId === undefined || row.room_id === query.roomId) && (query.ownerId === undefined || row.owner_id === query.ownerId) && (!dateFrom || startDate >= dateFrom) && (!dateTo || startDate <= dateTo) && (status === 'all' || state === status);
    }).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at) || a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' })).map((row) => this.toSummary(row, now));
  }

  listOwners(user: AuthenticatedUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Недостаточно прав для выполнения операции');
    return this.database.sqlite.prepare('select id, name, email, role from users order by name collate binary asc, email collate binary asc').all();
  }

  detail(id: string, user: AuthenticatedUser) {
    return this.detailInTransaction(id, user);
  }

  update(id: string, values: Record<string, unknown>, user: AuthenticatedUser) {
    this.ensureFields(values, new Set([...BOOKING_FIELDS, 'version']));
    return this.immediate(() => {
      const existing = this.readBooking(id);
      this.ensureEditable(existing, user);
      const expectedVersion = this.validateVersion(values.version);
      if (existing.version !== expectedVersion) throw new ConflictException('Бронирование изменилось. Загрузите актуальные данные');
      const fields = this.validateFields(values);
      const room = this.findRoom(fields.roomId);
      this.validateRoom(room, fields);
      this.ensureFree(fields.roomId, fields.interval, id);
      const now = new Date().toISOString();
      const result = this.database.sqlite.prepare(
        `update bookings set room_id = ?, subject = ?, description = ?, participants = ?, starts_at = ?, ends_at = ?, version = version + 1, updated_at = ?
          where id = ? and version = ? and cancelled_at is null`,
      ).run(fields.roomId, fields.subject, fields.description, fields.participants, fields.interval.startsAt, fields.interval.endsAt, now, id, expectedVersion);
      if (result.changes !== 1) throw new ConflictException('Бронирование изменилось. Загрузите актуальные данные');
      return this.detailInTransaction(id, user);
    });
  }

  cancel(id: string, values: Record<string, unknown>, user: AuthenticatedUser) {
    this.ensureFields(values, new Set(['version', 'reason']));
    return this.immediate(() => {
      const existing = this.readBooking(id);
      this.ensureCancellable(existing, user);
      // Repeated cancellation intentionally wins over an obsolete optimistic version.
      if (existing.cancelled_at !== null) throw new ConflictException('Бронирование уже отменено');
      const expectedVersion = this.validateVersion(values.version);
      if (existing.version !== expectedVersion) throw new ConflictException('Бронирование изменилось. Загрузите актуальные данные');
      const isAdminCancellation = existing.owner_id !== user.id;
      if (isAdminCancellation) {
        const reason = normalizeText(values.reason);
        if (reason === undefined || unicodeLength(reason) < 1 || unicodeLength(reason) > 1000) throw this.fieldError('reason: Укажите причину отмены от 1 до 1000 символов');
      } else if (values.reason !== undefined) {
        const reason = normalizeText(values.reason);
        if (reason === undefined || reason.length > 0) throw this.fieldError('reason: Причина собственной отмены не поддерживается');
      }
      if (Date.parse(existing.starts_at) <= Date.now()) throw new ConflictException('Можно отменить только будущую запланированную встречу');
      const now = new Date().toISOString();
      const result = this.database.sqlite.prepare(
        `update bookings set cancelled_at = ?, cancelled_by_user_id = ?, cancellation_type = ?, cancellation_reason = ?,
          cancellation_actor_name = ?, cancellation_actor_email = ?, cancellation_actor_role = ?, version = version + 1, updated_at = ?
          where id = ? and version = ? and cancelled_at is null`,
      ).run(now, user.id, isAdminCancellation ? 'admin' : 'owner', isAdminCancellation ? normalizeText(values.reason) : null, user.name, user.email, user.role, now, id, expectedVersion);
      if (result.changes !== 1) throw new ConflictException('Бронирование изменилось. Загрузите актуальные данные');
      return this.detailInTransaction(id, user);
    });
  }

  private validateFields(values: Record<string, unknown>): ValidatedFields {
    const errors: string[] = [];
    const roomId = typeof values.roomId === 'string' && values.roomId.length > 0 ? values.roomId : undefined;
    const subject = normalizeText(values.subject, { singleLine: true });
    const description = values.description === undefined ? null : normalizeText(values.description);
    const participants = parseInteger(values.participants);
    if (!roomId) errors.push('roomId: Выберите комнату');
    if (subject === undefined || unicodeLength(subject) === 0 || unicodeLength(subject) > 120) errors.push('subject: Укажите тему от 1 до 120 символов без переносов строк');
    if (description === undefined || (description !== null && unicodeLength(description) > 2000)) errors.push('description: Описание может содержать до 2000 символов');
    const intervalResult = validateBookingInterval(values);
    errors.push(...intervalResult.errors);
    if (participants === undefined || participants < 1) errors.push('participants: Укажите целое количество участников не меньше 1');
    if (errors.length > 0 || !roomId || !subject || !intervalResult.interval || participants === undefined) throw this.fieldError(...errors);
    return { roomId, subject, description: description || null, participants, interval: intervalResult.interval };
  }

  private validateRoom(room: RoomRow | undefined, fields: ValidatedFields): asserts room is RoomRow {
    if (!room) throw new NotFoundException('Комната не найдена');
    if (room.status !== 'available') throw new ConflictException('Комната недоступна для новых бронирований');
    if (fields.participants > room.capacity) throw this.fieldError(`participants: Количество участников не может превышать вместимость комнаты (${room.capacity})`);
  }

  private ensureFree(roomId: string, interval: BookingInterval, excludedId?: string): void {
    const row = this.database.sqlite.prepare(
      `select id, starts_at, ends_at from bookings
       where room_id = ? and cancelled_at is null and starts_at < ? and ends_at > ?${excludedId ? ' and id <> ?' : ''} limit 1`,
    ).get(...(excludedId ? [roomId, interval.endsAt, interval.startsAt, excludedId] : [roomId, interval.endsAt, interval.startsAt])) as Pick<BookingRow, 'starts_at' | 'ends_at'> | undefined;
    if (row && intervalsOverlap({ startsAt: row.starts_at, endsAt: row.ends_at }, interval)) throw new ConflictException('Выбранный интервал уже занят');
  }

  private ensureEditable(existing: BookingRow, user: AuthenticatedUser): void {
    if (existing.owner_id !== user.id) {
      if (user.role === 'employee') throw this.neutralNotFound();
      throw new ForbiddenException('Администратор не может изменять чужое бронирование');
    }
    if (existing.cancelled_at !== null || Date.parse(existing.starts_at) <= Date.now()) throw new ConflictException('Можно изменить только будущую запланированную встречу');
  }

  private ensureCancellable(existing: BookingRow, user: AuthenticatedUser): void {
    if (existing.owner_id !== user.id) {
      if (user.role === 'employee') throw this.neutralNotFound();
    }
  }

  private detailInTransaction(id: string, user: AuthenticatedUser) {
    const booking = this.readBooking(id);
    if (user.role !== 'admin' && booking.owner_id !== user.id) throw this.neutralNotFound();
    return this.toDetail(booking);
  }

  private readBooking(id: string): BookingRow {
    const booking = this.selectBookings('where bookings.id = ?', [id])[0];
    if (!booking) throw this.neutralNotFound();
    return booking;
  }

  private selectBookings(where: string, params: unknown[]): BookingRow[] {
    return this.database.sqlite.prepare(
      `select bookings.*, users.name as owner_name, users.email as owner_email, rooms.name as room_name, rooms.floor as room_floor,
        rooms.location as room_location, rooms.capacity as room_capacity, rooms.status as room_status
       from bookings join users on users.id = bookings.owner_id join rooms on rooms.id = bookings.room_id ${where}`,
    ).all(...params) as BookingRow[];
  }

  private findRoom(id: string): RoomRow | undefined {
    return this.database.sqlite.prepare('select id, name, floor, location, capacity, description, status from rooms where id = ?').get(id) as RoomRow | undefined;
  }

  private toSummary(row: BookingRow, now: number) {
    const status = this.status(row, now);
    return {
      id: row.id,
      subject: row.subject,
      room: { id: row.room_id, name: row.room_name, floor: row.room_floor, location: row.room_location, capacity: row.room_capacity, status: row.room_status },
      date: officeDate(row.starts_at),
      start: officeTime(row.starts_at),
      end: officeTime(row.ends_at),
      participants: row.participants,
      status,
      isCurrent: status === 'scheduled' && Date.parse(row.starts_at) <= now && now < Date.parse(row.ends_at),
    };
  }

  private toDetail(row: BookingRow) {
    const now = Date.now();
    return {
      ...this.toSummary(row, now),
      description: row.description,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      owner: { name: row.owner_name, email: row.owner_email },
      cancellation: row.cancelled_at === null ? null : {
        cancelledAt: row.cancelled_at,
        type: row.cancellation_type,
        reason: row.cancellation_reason,
        actor: { name: row.cancellation_actor_name, email: row.cancellation_actor_email, role: row.cancellation_actor_role },
      },
    };
  }

  private status(row: BookingRow, now: number): BookingStatus {
    if (row.cancelled_at !== null) return 'cancelled';
    return Date.parse(row.ends_at) <= now ? 'completed' : 'scheduled';
  }

  private validateVersion(value: unknown): number {
    const version = parseInteger(value);
    if (version === undefined || version < 1) throw this.fieldError('version: Укажите актуальную версию бронирования');
    return version;
  }

  private ensureFields(values: Record<string, unknown>, allowed: Set<string>, message = 'Переданы неподдерживаемые поля'): void {
    const unsupported = Object.keys(values).filter((key) => !allowed.has(key));
    if (unsupported.length > 0) throw this.fieldError(message);
  }

  private immediate<T>(operation: () => T): T {
    this.database.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  private fieldError(...messages: string[]): BadRequestException {
    return new BadRequestException({ message: messages });
  }

  private neutralNotFound(): NotFoundException {
    return new NotFoundException('Бронирование не найдено или недоступно');
  }
}
