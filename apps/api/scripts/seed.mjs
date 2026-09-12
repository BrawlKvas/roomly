import argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { openDatabase } from './database.mjs';

const equipmentRows = [
  ['tv', 'Телевизор'],
  ['projector', 'Проектор'],
  ['whiteboard', 'Маркерная доска'],
  ['video_conferencing', 'Оборудование для видеоконференций'],
];

const roomImages = new Map([
  ['room-atlas', { data: readFileSync(join(import.meta.dirname, '../assets/room-images/atlas.png')), fileName: 'atlas.png' }],
  ['room-borey', { data: readFileSync(join(import.meta.dirname, '../assets/room-images/borey.png')), fileName: 'borey.png' }],
  ['room-cedar', { data: readFileSync(join(import.meta.dirname, '../assets/room-images/cedar.png')), fileName: 'cedar.png' }],
]);

const roomRows = [
  {
    id: 'room-atlas',
    name: 'Атлас',
    nameKey: comparisonKey('Атлас'),
    floor: 2,
    location: 'Крыло A, 2.14',
    capacity: 10,
    description: 'Светлая переговорная для командных встреч.',
    status: 'available',
    equipment: ['tv', 'whiteboard'],
  },
  {
    id: 'room-borey',
    name: 'Борей',
    nameKey: comparisonKey('Борей'),
    floor: 3,
    location: 'Крыло B, 3.08',
    capacity: 4,
    description: null,
    status: 'available',
    equipment: ['projector'],
  },
  {
    id: 'room-cedar',
    name: 'Кедр',
    nameKey: comparisonKey('Кедр'),
    floor: 5,
    location: 'Крыло C, 5.21',
    capacity: 16,
    description: 'Комната временно недоступна для новых бронирований.',
    status: 'unavailable',
    equipment: ['tv', 'projector', 'video_conferencing'],
  },
];

function comparisonKey(value) {
  return value.replace(/[A-ZА-ЯЁ]/g, (character) => {
    if (character >= 'A' && character <= 'Z') {
      return String.fromCharCode(character.charCodeAt(0) + 32);
    }
    if (character === 'Ё') {
      return 'ё';
    }
    return String.fromCharCode(character.charCodeAt(0) + 32);
  });
}

function nextWeekdayAt(daysAhead, hour, minute = 0) {
  const result = new Date();
  result.setUTCSeconds(0, 0);
  result.setUTCDate(result.getUTCDate() + daysAhead);
  result.setUTCHours(hour, minute, 0, 0);

  while (result.getUTCDay() === 0 || result.getUTCDay() === 6) {
    result.setUTCDate(result.getUTCDate() + 1);
  }

  return result;
}

function iso(date) {
  return date.toISOString();
}

async function passwordHash(password, salt) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    salt: Buffer.from(salt, 'utf8'),
  });
}

async function seed() {
  const employeeHash = await passwordHash('EmployeePass!2026', 'roomly-employee!');
  const adminHash = await passwordHash('AdminPass!2026', 'roomly-admin-user!');
  const now = new Date();
  const createdAt = iso(now);
  const ongoingStart = new Date(now.getTime() - 30 * 60 * 1000);
  const ongoingEnd = new Date(now.getTime() + 30 * 60 * 1000);
  const completedStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const completedEnd = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const futureStart = nextWeekdayAt(2, 10);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const cancelledStart = nextWeekdayAt(4, 14);
  const cancelledEnd = new Date(cancelledStart.getTime() + 60 * 60 * 1000);
  const cancelledAt = new Date(now.getTime() - 15 * 60 * 1000);

  const sqlite = openDatabase();
  try {
    const insertUser = sqlite.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, email_key, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEquipment = sqlite.prepare(
      'INSERT OR IGNORE INTO equipment (code, name) VALUES (?, ?)',
    );
    const insertRoom = sqlite.prepare(`
      INSERT OR IGNORE INTO rooms
        (id, name, name_key, floor, location, capacity, description, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const insertRoomEquipment = sqlite.prepare(
      'INSERT OR IGNORE INTO room_equipment (room_id, equipment_code) VALUES (?, ?)',
    );
    const addSeedImage = sqlite.prepare(
      `UPDATE rooms
       SET image_data = ?, image_mime_type = 'image/png', image_file_name = ?, updated_at = ?
       WHERE id = ? AND image_data IS NULL`,
    );
    const insertBooking = sqlite.prepare(`
      INSERT OR IGNORE INTO bookings
        (id, owner_id, room_id, subject, description, participants, starts_at, ends_at, version, created_at, updated_at,
         cancelled_at, cancelled_by_user_id, cancellation_type, cancellation_reason,
         cancellation_actor_name, cancellation_actor_email, cancellation_actor_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sqlite.transaction(() => {
      insertUser.run(
        'user-employee',
        'Анна Соколова',
        'employee@northstar.local',
        comparisonKey('employee@northstar.local'),
        employeeHash,
        'employee',
        createdAt,
      );
      insertUser.run(
        'user-employee-2',
        'Мария Лебедева',
        'employee2@northstar.local',
        comparisonKey('employee2@northstar.local'),
        employeeHash,
        'employee',
        createdAt,
      );
      insertUser.run(
        'user-admin',
        'Илья Воронов',
        'admin@northstar.local',
        comparisonKey('admin@northstar.local'),
        adminHash,
        'admin',
        createdAt,
      );

      for (const row of equipmentRows) {
        insertEquipment.run(...row);
      }
      for (const room of roomRows) {
        insertRoom.run(
          room.id,
          room.name,
          room.nameKey,
          room.floor,
          room.location,
          room.capacity,
          room.description,
          room.status,
          createdAt,
          createdAt,
        );
        const image = roomImages.get(room.id);
        if (!image) throw new Error(`Missing seed image for ${room.id}`);
        addSeedImage.run(image.data, image.fileName, createdAt, room.id);
        for (const equipmentCode of room.equipment) {
          insertRoomEquipment.run(room.id, equipmentCode);
        }
      }

      insertBooking.run(
        'booking-future',
        'user-employee',
        'room-atlas',
        'Планирование спринта',
        null,
        6,
        iso(futureStart),
        iso(futureEnd),
        createdAt,
        createdAt,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      insertBooking.run(
        'booking-ongoing',
        'user-admin',
        'room-borey',
        'Текущая встреча',
        'Запись демонстрирует идущую встречу.',
        3,
        iso(ongoingStart),
        iso(ongoingEnd),
        createdAt,
        createdAt,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      insertBooking.run(
        'booking-completed',
        'user-employee',
        'room-atlas',
        'Завершённая встреча',
        null,
        4,
        iso(completedStart),
        iso(completedEnd),
        createdAt,
        createdAt,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      insertBooking.run(
        'booking-cancelled',
        'user-employee',
        'room-cedar',
        'Отменённая встреча',
        null,
        8,
        iso(cancelledStart),
        iso(cancelledEnd),
        createdAt,
        createdAt,
        iso(cancelledAt),
        'user-admin',
        'admin',
        'Комната временно недоступна для этой встречи.',
        'Илья Воронов',
        'admin@northstar.local',
        'admin',
      );
    })();
  } finally {
    sqlite.close();
  }

  console.info('Reference data has been seeded.');
}

void seed();
