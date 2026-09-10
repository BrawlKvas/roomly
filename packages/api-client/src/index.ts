/**
 * Shared API types are generated into this workspace as the HTTP contract grows.
 */
export interface HealthResponse {
  status: 'ok';
}

export type UserRole = 'employee' | 'admin';

export interface CurrentUser {
  name: string;
  email: string;
  role: UserRole;
}

export interface SessionResponse {
  user: CurrentUser;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type EquipmentCode = 'tv' | 'projector' | 'whiteboard' | 'video_conferencing';

export interface Room {
  id: string;
  name: string;
  floor: number;
  location: string;
  capacity: number;
  description: string | null;
  status: 'available' | 'unavailable';
  equipment: EquipmentCode[];
  imageUrl: string | null;
}

export interface BusyScheduleEntry {
  startsAt: string;
  endsAt: string;
  id?: string;
  subject?: string;
  description?: string | null;
  participants?: number;
  status?: 'scheduled' | 'completed';
  owner?: { name: string; email: string };
}

export interface RoomSchedule {
  date: string;
  bookingAllowed: boolean;
  entries: BusyScheduleEntry[];
}

export type BookingStatus = 'scheduled' | 'completed' | 'cancelled';
export type BookingView = 'upcoming' | 'current' | 'past' | 'cancelled' | 'all';

export interface BookingSummary {
  id: string;
  subject: string;
  room: Pick<Room, 'id' | 'name' | 'floor' | 'location' | 'capacity' | 'status'>;
  date: string;
  start: string;
  end: string;
  participants: number;
  status: BookingStatus;
  isCurrent: boolean;
}

export interface BookingDetail extends BookingSummary {
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner: { name: string; email: string };
  cancellation: null | {
    cancelledAt: string;
    type: 'owner' | 'admin';
    reason: string | null;
    actor: { name: string | null; email: string | null; role: UserRole | null };
  };
}
