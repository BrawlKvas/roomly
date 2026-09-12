import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';

import type { AuthenticatedUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { officeDayRange, officeTime, parseOfficeDate, validateSearchInterval } from './office-time';
import { normalizeText, parseInteger, unicodeLength } from '../bookings/booking-domain';

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
  version: number;
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
  version: number;
}

@Injectable()
export class RoomsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  listRooms(): RoomResponse[] {
    const rows = this.database.sqlite
      .prepare('select id, name, floor, location, capacity, description, status, image_mime_type, version from rooms order by floor asc, id collate binary asc')
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

  create(values: Record<string, unknown>): RoomResponse {
    this.ensureFields(values, new Set(['name', 'floor', 'location', 'capacity', 'description', 'equipment', 'status']));
    return this.immediate(() => {
      const fields = this.validateRoomFields(values); const id = randomUUID(); const now = new Date().toISOString();
      try { this.database.sqlite.prepare('insert into rooms (id,name,name_key,floor,location,capacity,description,status,version,created_at,updated_at) values (?,?,?,?,?,?,?,?,1,?,?)').run(id, fields.name, this.nameKey(fields.name), fields.floor, fields.location, fields.capacity, fields.description, fields.status, now, now); this.replaceEquipment(id, fields.equipment); }
      catch (error) { if (this.isUniqueError(error)) throw new ConflictException('name: Комната с таким названием уже существует'); throw error; }
      return this.getRoom(id);
    });
  }

  update(id: string, values: Record<string, unknown>): RoomResponse {
    this.ensureFields(values, new Set(['name', 'floor', 'location', 'capacity', 'description', 'equipment', 'status', 'version']));
    return this.immediate(() => {
      const current = this.findRoom(id); if (!current) throw new NotFoundException('Комната не найдена');
      const version = this.validateVersion(values.version); const fields = this.validateRoomFields(values);
      if (current.version !== version) throw new ConflictException('Комната изменилась. Загрузите актуальные данные');
      if (this.database.sqlite.prepare('select id from bookings where room_id = ? and cancelled_at is null and ends_at > ? and participants > ? limit 1').get(id, new Date().toISOString(), fields.capacity)) throw new ConflictException('Вместимость меньше числа участников активной встречи');
      try { const changed = this.database.sqlite.prepare('update rooms set name=?, name_key=?, floor=?, location=?, capacity=?, description=?, status=?, version=version+1, updated_at=? where id=? and version=?').run(fields.name, this.nameKey(fields.name), fields.floor, fields.location, fields.capacity, fields.description, fields.status, new Date().toISOString(), id, version); if (changed.changes !== 1) throw new ConflictException('Комната изменилась. Загрузите актуальные данные'); this.replaceEquipment(id, fields.equipment); }
      catch (error) { if (this.isUniqueError(error)) throw new ConflictException('name: Комната с таким названием уже существует'); throw error; }
      return this.getRoom(id);
    });
  }

  replaceImage(id: string, versionValue: unknown, image: { buffer: Buffer; originalname?: string } | undefined): RoomResponse {
    return this.immediate(() => { const room = this.findRoom(id); if (!room) throw new NotFoundException('Комната не найдена'); const version = this.validateVersion(versionValue); if (room.version !== version) throw new ConflictException('Комната изменилась. Загрузите актуальные данные'); if (!image) throw this.fieldError('image: Выберите изображение PNG или JPEG'); const mime = validateImage(image.buffer); const result = this.database.sqlite.prepare('update rooms set image_data=?, image_mime_type=?, image_file_name=?, version=version+1, updated_at=? where id=? and version=?').run(image.buffer, mime, image.originalname ?? null, new Date().toISOString(), id, version); if (result.changes !== 1) throw new ConflictException('Комната изменилась. Загрузите актуальные данные'); return this.getRoom(id); });
  }

  removeImage(id: string, versionValue: unknown): RoomResponse {
    return this.immediate(() => { const room = this.findRoom(id); if (!room) throw new NotFoundException('Комната не найдена'); const version = this.validateVersion(versionValue); if (room.version !== version) throw new ConflictException('Комната изменилась. Загрузите актуальные данные'); const result = this.database.sqlite.prepare('update rooms set image_data=null, image_mime_type=null, image_file_name=null, version=version+1, updated_at=? where id=? and version=?').run(new Date().toISOString(), id, version); if (result.changes !== 1) throw new ConflictException('Комната изменилась. Загрузите актуальные данные'); return this.getRoom(id); });
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
      version: room.version,
    }));
  }

  private findRoom(id: string): RoomRow | undefined {
    return this.database.sqlite
      .prepare('select id, name, floor, location, capacity, description, status, image_mime_type, version from rooms where id = ?')
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

  private validateRoomFields(values: Record<string, unknown>) {
    const errors: string[] = [];
    const normalizedName = normalizeText(values.name, { singleLine: true });
    const name = normalizedName?.replace(/[\t-\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu, ' ');
    const location = normalizeText(values.location, { singleLine: true });
    const description = values.description === undefined || values.description === null ? null : normalizeText(values.description);
    const floor = parseInteger(values.floor); const capacity = parseInteger(values.capacity);
    const status = values.status === undefined ? 'available' : values.status; const equipment = this.parseEquipment(values.equipment, errors);
    if (!name || unicodeLength(name) > 80) errors.push('name: Укажите название от 1 до 80 символов');
    if (!location || unicodeLength(location) > 120) errors.push('location: Укажите расположение от 1 до 120 символов без переносов строк');
    if (floor === undefined || floor < 1 || floor > 99) errors.push('floor: Укажите целый этаж от 1 до 99');
    if (capacity === undefined || capacity < 1 || capacity > 1000) errors.push('capacity: Укажите целую вместимость от 1 до 1000');
    if (description === undefined || (description !== null && unicodeLength(description) > 2000)) errors.push('description: Описание может содержать до 2000 символов');
    if (status !== 'available' && status !== 'unavailable') errors.push('status: Укажите доступность комнаты');
    if (errors.length || !name || !location || floor === undefined || capacity === undefined || (status !== 'available' && status !== 'unavailable')) throw this.fieldError(...errors);
    return { name, location, floor, capacity, description: description || null, status, equipment };
  }

  private replaceEquipment(id: string, equipment: string[]): void { this.database.sqlite.prepare('delete from room_equipment where room_id=?').run(id); const insert = this.database.sqlite.prepare('insert into room_equipment (room_id,equipment_code) values (?,?)'); for (const code of equipment) insert.run(id, code); }
  private validateVersion(value: unknown): number { const version = parseInteger(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value); if (version === undefined || version < 1) throw this.fieldError('version: Укажите актуальную версию комнаты'); return version; }
  private nameKey(value: string): string { return value.replace(/[A-ZА-ЯЁ]/g, (character) => character === 'Ё' ? 'ё' : character.toLowerCase()); }
  private ensureFields(values: Record<string, unknown>, allowed: Set<string>): void { if (Object.keys(values).some((key) => !allowed.has(key))) throw this.fieldError('Переданы неподдерживаемые поля'); }
  private isUniqueError(error: unknown): boolean { return error instanceof Error && (error.message.includes('rooms_name_key_unique') || error.message.includes('rooms.name_key')); }
  private immediate<T>(operation: () => T): T { this.database.sqlite.exec('BEGIN IMMEDIATE'); try { const result = operation(); this.database.sqlite.exec('COMMIT'); return result; } catch (error) { this.database.sqlite.exec('ROLLBACK'); throw error; } }

  private fieldError(...messages: string[]): BadRequestException {
    return new BadRequestException({ message: messages });
  }

  private isWorkingDay(date: string): boolean {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }
}

function validateImage(data: Buffer): 'image/png' | 'image/jpeg' {
  if (data.length === 0 || data.length > 5 * 1024 * 1024) throw new BadRequestException({ message: ['image: Размер изображения должен быть от 1 до 5242880 байт'] });
  if (isValidPng(data)) return 'image/png';
  if (isValidJpeg(data)) return 'image/jpeg';
  throw new BadRequestException({ message: ['image: Требуется полное неподвижное изображение PNG или JPEG без лишних данных'] });
}

function isValidPng(data: Buffer): boolean {
  if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8; let header: Buffer | undefined; let seenIdat = false; const compressed: Buffer[] = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset); const chunkEnd = offset + 12 + length;
    if (chunkEnd > data.length) return false;
    const type = data.subarray(offset + 4, offset + 8); const payload = data.subarray(offset + 8, offset + 8 + length);
    if (data.readUInt32BE(offset + 8 + length) !== crc32(Buffer.concat([type, payload]))) return false;
    const name = type.toString('ascii');
    if (!header && name !== 'IHDR') return false;
    if (name === 'IHDR') { if (header || length !== 13) return false; header = payload; }
    else if (name === 'acTL' || name === 'fcTL' || name === 'fdAT') return false;
    else if (name === 'IDAT') { if (!header) return false; seenIdat = true; compressed.push(payload); }
    else if (name === 'IEND') { if (!header || !seenIdat || length !== 0 || chunkEnd !== data.length) return false; return validPngPixels(header, Buffer.concat(compressed)); }
    else if (seenIdat && /^[A-Z]/.test(name)) return false;
    offset = chunkEnd;
  }
  return false;
}

function validPngPixels(header: Buffer, compressed: Buffer): boolean {
  const width = header.readUInt32BE(0); const height = header.readUInt32BE(4); const bitDepth = header[8]; const color = header[9]; const compression = header[10]; const filter = header[11]; const interlace = header[12];
  if (!width || !height || !bitDepth || compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) return false;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color ?? -1];
  if (!channels || !([1, 2, 4, 8, 16].includes(bitDepth!) && (color === 0 || color === 3) || [8, 16].includes(bitDepth!) && [2, 4, 6].includes(color!))) return false;
  try { const raw = inflateSync(compressed); if (interlace === 0) { const rowBytes = Math.ceil(width * channels * bitDepth! / 8); if (raw.length !== height * (rowBytes + 1)) return false; for (let row = 0; row < height; row += 1) if ((raw[row * (rowBytes + 1)] ?? 5) > 4) return false; } return true; } catch { return false; }
}

function isValidJpeg(data: Buffer): boolean {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return false;
  let offset = 2; let dimensions = false; let scan = false;
  while (offset < data.length) {
    if (data[offset++] !== 0xff) return false; while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++]; if (marker === undefined) return false;
    if (marker === 0xd9) return scan && dimensions && offset === data.length;
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || offset + 2 > data.length) return false;
    const length = data.readUInt16BE(offset); if (length < 2 || offset + length > data.length) return false;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) { if (length < 8 || data.readUInt16BE(offset + 3) === 0 || data.readUInt16BE(offset + 5) === 0) return false; dimensions = true; }
    offset += length;
    if (marker === 0xda) { scan = true; while (offset < data.length) { const value = data[offset++]; if (value !== 0xff) continue; while (data[offset] === 0xff) offset += 1; const next = data[offset]; if (next === 0x00) { offset += 1; continue; } if (next === undefined || next === 0xd8) return false; break; } }
  }
  return false;
}

function crc32(data: Buffer): number { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
