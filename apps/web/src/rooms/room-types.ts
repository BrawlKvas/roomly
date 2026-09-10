export type { BusyScheduleEntry, EquipmentCode, Room, RoomSchedule } from '@roomly/api-client';
import type { EquipmentCode } from '@roomly/api-client';

export const equipmentLabels: Record<EquipmentCode, string> = {
  projector: 'Проектор',
  tv: 'Телевизор',
  video_conferencing: 'Видеоконференции',
  whiteboard: 'Маркерная доска',
};

export function officeToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
