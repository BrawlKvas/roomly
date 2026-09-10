import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { officeDayRange, officeTime, parseOfficeDate, validateSearchInterval } from './office-time';

const EQUIPMENT = new Set(['tv', 'projector', 'whiteboard', 'video_conferencing']);

interface RoomRow {
  id: string;
  name: string;
  floor: number;
  location: string;
  capacity: number;
  description: string | null;
  status: 'available' | 'unavailable';
  image_mime_type: string | null;
}

interface BookingRow {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  subject: string;
  description: string | null;
  participants: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

export interface RoomResponse {
  id: string;
  name: string;
  floor: number;
  location: string;
  capacity: number;
  description: string | null;
  status: 'available' | 'unavailable';
  equipment: string[];
  imageUrl: string | null;
}

@Injectable()
export class RoomsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  listRooms(): RoomResponse[] {
    const rows = this.database.sqlite
      .prepare('select id, name, floor, location, capacity, description, status, image_mime_type from rooms order by floor asc, id collate binary asc')
      .all() as RoomRow[];
    return this.withEquipment(rows);
  }

  getRoom(id: string): RoomResponse {
    const row = this.findRoom(id);
    if (!row) throw new NotFoundException('Комната не найдена');
    return this.withEquipment([row])[0]!;
  }

  getImage(id: string): { data: Buffer; mimeType: string } {
    const row = this.database.sqlite
      .prepare('select image_data, image_mime_type from rooms where id = ?')
      .get(id) as { image_data: Buffer | null; image_mime_type: string | null } | undefined;
    if (!row) throw new NotFoundException('Комната не найдена');
    if (!row.image_data || !row.image_mime_type) throw new NotFoundException('Изображение комнаты отсутствует');
    return { data: row.image_data, mimeType: row.image_mime_type };
  }

  getSchedule(id: string, dateValue: unknown, user: AuthenticatedUser) {
    if (!this.findRoom(id)) throw new NotFoundException('Комната не найдена');
    const date = parseOfficeDate(dateValue);
    if (!date) throw this.fieldError('date: Укажите существующую календарную дату');
    const { from, to } = officeDayRange(date);
    const rows = this.database.sqlite
      .prepare(
        `select bookings.id, bookings.owner_id, users.name as owner_name, users.email as owner_email,
                bookings.subject, bookings.description, bookings.participants, bookings.starts_at,
                bookings.ends_at, bookings.created_at
           from bookings join users on users.id = bookings.owner_id
          where bookings.room_id = ? and bookings.cancelled_at is null
            and bookings.starts_at >= ? and bookings.starts_at < ?
          order by bookings.starts_at asc, bookings.id collate binary asc`,
      )
      .all(id, from, to) as BookingRow[];

    return {
      date,
      bookingAllowed: this.isWorkingDay(date),
      entries: rows.map((row) => this.scheduleEntry(row, user)),
    };
  }

  search(query: Record<string, unknown>, user: AuthenticatedUser): RoomResponse[] {
    void user; // Search deliberately exposes only room information, never booking details.
    const unsupportedFields = Object.keys(query).filter((field) => !['date', 'start', 'end', 'minimumCapacity', 'floor', 'equipment'].includes(field));
    if (unsupportedFields.length > 0) throw this.fieldError('Переданы неподдерживаемые параметры поиска');
    const { interval, fieldErrors } = validateSearchInterval(query);
    const minimumCapacity = this.optionalInteger(query.minimumCapacity, 'minimumCapacity', 1, 1000, fieldErrors);
    const floor = this.optionalInteger(query.floor, 'floor', 1, 99, fieldErrors);
    const equipment = this.parseEquipment(query.equipment, fieldErrors);
    if (fieldErrors.length > 0 || !interval) throw this.fieldError(...fieldErrors);

    const rooms = this.listRooms().filter((room) => {
      if (room.status !== 'available') return false;
      if (minimumCapacity !== undefined && room.capacity < minimumCapacity) return false;
      if (floor !== undefined && room.floor !== floor) return false;
      return equipment.every((code) => room.equipment.includes(code));
    });
    if (rooms.length === 0) return [];

    const placeholders = rooms.map(() => '?').join(', ');
    const occupied = this.database.sqlite
      .prepare(
        `select distinct room_id from bookings
          where cancelled_at is null and room_id in (${placeholders})
            and starts_at < ? and ends_at > ?`,
      )
      .all(...rooms.map((room) => room.id), interval.endsAt, interval.startsAt) as Array<{ room_id: string }>;
    const occupiedIds = new Set(occupied.map((row) => row.room_id));
    return rooms.filter((room) => !occupiedIds.has(room.id));
  }

  private scheduleEntry(row: BookingRow, user: AuthenticatedUser) {
    const busyInterval = { startsAt: officeTime(row.starts_at), endsAt: officeTime(row.ends_at) };
    if (user.role !== 'admin' && row.owner_id !== user.id) return busyInterval;
    const now = Date.now();
    return {
      ...busyInterval,
      id: row.id,
      subject: row.subject,
      description: row.description,
      participants: row.participants,
      createdAt: row.created_at,
      status: new Date(row.ends_at).getTime() <= now ? 'completed' : 'scheduled',
      owner: { name: row.owner_name, email: row.owner_email },
    };
  }

  private withEquipment(rows: RoomRow[]): RoomResponse[] {
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => '?').join(', ');
    const equipmentRows = this.database.sqlite
      .prepare(`select room_id, equipment_code from room_equipment where room_id in (${placeholders}) order by equipment_code asc`)
      .all(...rows.map((room) => room.id)) as Array<{ room_id: string; equipment_code: string }>;
    const equipmentByRoom = new Map<string, string[]>();
    for (const row of equipmentRows) {
      const codes = equipmentByRoom.get(row.room_id) ?? [];
      codes.push(row.equipment_code);
      equipmentByRoom.set(row.room_id, codes);
    }
    return rows.map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor,
      location: room.location,
      capacity: room.capacity,
      description: room.description,
      status: room.status,
      equipment: equipmentByRoom.get(room.id) ?? [],
      imageUrl: room.image_mime_type ? `/api/v1/rooms/${encodeURIComponent(room.id)}/image` : null,
    }));
  }

  private findRoom(id: string): RoomRow | undefined {
    return this.database.sqlite
      .prepare('select id, name, floor, location, capacity, description, status, image_mime_type from rooms where id = ?')
      .get(id) as RoomRow | undefined;
  }

  private optionalInteger(value: unknown, field: string, minimum: number, maximum: number, errors: string[]): number | undefined {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
      errors.push(`${field}: Укажите целое число`);
      return undefined;
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      errors.push(`${field}: Значение должно быть от ${minimum} до ${maximum}`);
      return undefined;
    }
    return number;
  }

  private parseEquipment(value: unknown, errors: string[]): string[] {
    if (value === undefined || value === '') return [];
    const codes = Array.isArray(value) ? value : [value];
    if (!codes.every((code) => typeof code === 'string' && EQUIPMENT.has(code))) {
      errors.push('equipment: Выберите известное оборудование');
      return [];
    }
    if (new Set(codes).size !== codes.length) {
      errors.push('equipment: Оборудование не должно повторяться');
    }
    return codes as string[];
  }

  private fieldError(...messages: string[]): BadRequestException {
    return new BadRequestException({ message: messages });
  }

  private isWorkingDay(date: string): boolean {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }
}
