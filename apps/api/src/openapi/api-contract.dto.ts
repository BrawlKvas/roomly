import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400, type: Number }) status!: number;
  @ApiProperty({ example: 'VALIDATION_ERROR', type: String }) code!: string;
  @ApiProperty({ example: 'Не удалось обработать запрос', type: String }) message!: string;
  @ApiProperty({ example: ['subject: Укажите тему'], type: String }) fieldErrors!: string[];
  @ApiProperty({ example: 'f026e5ca-01e4-4c79-a52e-c44d9c32d967', type: String }) requestId!: string;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], type: String }) status!: 'ok';
}

export class UserDto {
  @ApiProperty({ example: 'Анна Соколова', type: String }) name!: string;
  @ApiProperty({ example: 'employee@northstar.local', type: String }) email!: string;
  @ApiProperty({ enum: ['employee', 'admin'], type: String }) role!: 'employee' | 'admin';
}

export class SessionResponseDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
  @ApiProperty({ format: 'date-time', type: String }) expiresAt!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'employee@northstar.local', type: String }) email!: string;
  @ApiProperty({ example: 'EmployeePass!2026', format: 'password', type: String }) password!: string;
}

export class RoomDto {
  @ApiProperty({ example: 'room-atlas', type: String }) id!: string;
  @ApiProperty({ example: 'Атлас', type: String }) name!: string;
  @ApiProperty({ example: 2, type: Number }) floor!: number;
  @ApiProperty({ example: 'Крыло A', type: String }) location!: string;
  @ApiProperty({ example: 12, type: Number }) capacity!: number;
  @ApiPropertyOptional({ nullable: true, example: 'Переговорная у окна', type: String }) description!: string | null;
  @ApiProperty({ enum: ['available', 'unavailable'], type: String }) status!: 'available' | 'unavailable';
  @ApiProperty({ enum: ['tv', 'projector', 'whiteboard', 'video_conferencing'], isArray: true, type: String }) equipment!: string[];
  @ApiPropertyOptional({ format: 'uri', nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ example: 1, type: Number }) version!: number;
}

export class RoomMutationDto {
  @ApiProperty({ example: 'Атлас', type: String }) name!: string;
  @ApiProperty({ example: 2, minimum: 1, maximum: 99, type: Number }) floor!: number;
  @ApiProperty({ example: 'Крыло A', type: String }) location!: string;
  @ApiProperty({ example: 12, minimum: 1, maximum: 1000, type: Number }) capacity!: number;
  @ApiPropertyOptional({ nullable: true, example: 'Переговорная у окна', type: String }) description?: string | null;
  @ApiPropertyOptional({ enum: ['available', 'unavailable'], default: 'available', type: String }) status?: 'available' | 'unavailable';
  @ApiPropertyOptional({ enum: ['tv', 'projector', 'whiteboard', 'video_conferencing'], isArray: true, type: String }) equipment?: string[];
}

export class RoomUpdateDto extends RoomMutationDto {
  @ApiProperty({ example: 1, minimum: 1, type: Number }) version!: number;
}

export class ImageVersionDto {
  @ApiProperty({ example: 1, minimum: 1, type: Number }) version!: number;
}

export class ScheduleEntryDto {
  @ApiProperty({ example: '10:00', type: String }) startsAt!: string;
  @ApiProperty({ example: '11:00', type: String }) endsAt!: string;
  @ApiPropertyOptional({ type: String }) id?: string;
  @ApiPropertyOptional({ type: String }) subject?: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description?: string | null;
  @ApiPropertyOptional({ type: Number }) participants?: number;
  @ApiPropertyOptional({ enum: ['scheduled', 'completed'], type: String }) status?: string;
  @ApiPropertyOptional({ type: UserDto }) owner?: Pick<UserDto, 'name' | 'email'>;
}

export class RoomScheduleDto {
  @ApiProperty({ example: '2026-10-05', type: String }) date!: string;
  @ApiProperty({ type: Boolean }) bookingAllowed!: boolean;
  @ApiProperty({ type: ScheduleEntryDto, isArray: true }) entries!: ScheduleEntryDto[];
}

export class BookingRoomDto {
  @ApiProperty({ example: 'room-atlas', type: String }) id!: string;
  @ApiProperty({ example: 'Атлас', type: String }) name!: string;
  @ApiProperty({ type: Number }) floor!: number;
  @ApiProperty({ type: String }) location!: string;
  @ApiProperty({ type: Number }) capacity!: number;
  @ApiProperty({ enum: ['available', 'unavailable'], type: String }) status!: string;
}

export class BookingSummaryDto {
  @ApiProperty({ example: 'booking-123', type: String }) id!: string;
  @ApiProperty({ example: 'Планирование', type: String }) subject!: string;
  @ApiProperty({ type: BookingRoomDto }) room!: BookingRoomDto;
  @ApiProperty({ example: '2026-10-05', type: String }) date!: string;
  @ApiProperty({ example: '10:00', type: String }) start!: string;
  @ApiProperty({ example: '11:00', type: String }) end!: string;
  @ApiProperty({ minimum: 1, type: Number }) participants!: number;
  @ApiProperty({ enum: ['scheduled', 'completed', 'cancelled'], type: String }) status!: string;
  @ApiProperty({ type: Boolean }) isCurrent!: boolean;
}

export class CancellationDto {
  @ApiProperty({ format: 'date-time', type: String }) cancelledAt!: string;
  @ApiProperty({ enum: ['owner', 'admin'], type: String }) type!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ type: UserDto }) actor!: UserDto;
}

export class BookingDetailDto extends BookingSummaryDto {
  @ApiPropertyOptional({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ minimum: 1, type: Number }) version!: number;
  @ApiProperty({ format: 'date-time', type: String }) createdAt!: string;
  @ApiProperty({ format: 'date-time', type: String }) updatedAt!: string;
  @ApiProperty({ type: UserDto }) owner!: Pick<UserDto, 'name' | 'email'>;
  @ApiPropertyOptional({ type: CancellationDto, nullable: true }) cancellation!: CancellationDto | null;
}

export class BookingMutationDto {
  @ApiProperty({ example: 'room-atlas', type: String }) roomId!: string;
  @ApiProperty({ example: 'Планирование', type: String }) subject!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description?: string | null;
  @ApiProperty({ example: 3, minimum: 1, type: Number }) participants!: number;
  @ApiProperty({ example: '2026-10-05', type: String }) date!: string;
  @ApiProperty({ example: '10:00', type: String }) start!: string;
  @ApiProperty({ example: '11:00', type: String }) end!: string;
}

export class BookingUpdateDto extends BookingMutationDto {
  @ApiProperty({ example: 1, minimum: 1, type: Number }) version!: number;
}

export class BookingCancellationDto {
  @ApiProperty({ example: 1, minimum: 1, type: Number }) version!: number;
  @ApiPropertyOptional({ example: 'Плановый ремонт', maxLength: 1000, type: String }) reason?: string;
}

export class BookingOwnerDto extends UserDto {
  @ApiProperty({ example: 'user-employee', type: String }) id!: string;
}
