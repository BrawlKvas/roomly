import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailKey: text('email_key').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['employee', 'admin'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('users_email_key_unique').on(table.emailKey),
    check('users_role_check', sql`${table.role} in ('employee', 'admin')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_expires_at_idx').on(table.expiresAt),
    index('sessions_user_expires_idx').on(table.userId, table.expiresAt),
  ],
);

export const rooms = sqliteTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    floor: integer('floor').notNull(),
    location: text('location').notNull(),
    capacity: integer('capacity').notNull(),
    description: text('description'),
    status: text('status', { enum: ['available', 'unavailable'] })
      .notNull()
      .default('available'),
    imageData: blob('image_data', { mode: 'buffer' }),
    imageMimeType: text('image_mime_type'),
    imageFileName: text('image_file_name'),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('rooms_name_key_unique').on(table.nameKey),
    check('rooms_status_check', sql`${table.status} in ('available', 'unavailable')`),
  ],
);

export const equipment = sqliteTable('equipment', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
});

export const roomEquipment = sqliteTable(
  'room_equipment',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    equipmentCode: text('equipment_code')
      .notNull()
      .references(() => equipment.code, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.equipmentCode] })],
);

export const bookings = sqliteTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    subject: text('subject').notNull(),
    description: text('description'),
    participants: integer('participants').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    cancelledAt: text('cancelled_at'),
    cancelledByUserId: text('cancelled_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    cancellationType: text('cancellation_type', { enum: ['owner', 'admin'] }),
    cancellationReason: text('cancellation_reason'),
    cancellationActorName: text('cancellation_actor_name'),
    cancellationActorEmail: text('cancellation_actor_email'),
    cancellationActorRole: text('cancellation_actor_role', {
      enum: ['employee', 'admin'],
    }),
  },
  (table) => [
    index('bookings_room_interval_idx').on(
      table.roomId,
      table.startsAt,
      table.endsAt,
      table.cancelledAt,
    ),
    index('bookings_owner_start_idx').on(table.ownerId, table.startsAt),
    index('bookings_admin_room_start_idx').on(table.roomId, table.startsAt),
    index('bookings_admin_owner_start_idx').on(table.ownerId, table.startsAt),
    index('bookings_admin_cancelled_start_idx').on(table.cancelledAt, table.startsAt),
    check('bookings_interval_check', sql`${table.endsAt} > ${table.startsAt}`),
    check('bookings_participants_check', sql`${table.participants} >= 1`),
    check(
      'bookings_cancellation_type_check',
      sql`${table.cancellationType} is null or ${table.cancellationType} in ('owner', 'admin')`,
    ),
    check(
      'bookings_cancellation_actor_role_check',
      sql`${table.cancellationActorRole} is null or ${table.cancellationActorRole} in ('employee', 'admin')`,
    ),
  ],
);
