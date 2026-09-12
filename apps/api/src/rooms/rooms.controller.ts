import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiConsumes, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto, ImageVersionDto, RoomDto, RoomMutationDto, RoomScheduleDto, RoomUpdateDto } from '../openapi/api-contract.dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiCookieAuth('roomly_session')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('rooms')
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'List every room ordered by floor and stable room ID' })
  @ApiOkResponse({ description: 'The room catalogue.', isArray: true, type: RoomDto })
  list() {
    return this.rooms.listRooms();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a room as an administrator' })
  @ApiBody({ type: RoomMutationDto })
  @ApiCreatedResponse({ type: RoomDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  create(@Body() values: Record<string, unknown>) { return this.rooms.create(values); }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a room as an administrator using optimistic version' })
  @ApiBody({ type: RoomUpdateDto })
  @ApiOkResponse({ type: RoomDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(@Param('id') id: string, @Body() values: Record<string, unknown>) { return this.rooms.update(id, values); }

  @Post(':id/image')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('image', {
    limits: { fieldSize: 128 * 1024, fields: 8, fileSize: 5 * 1024 * 1024, files: 1, parts: 10 },
  }))
  @ApiOperation({ summary: 'Upload or replace a PNG/JPEG room image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { image: { format: 'binary', type: 'string' }, version: { minimum: 1, type: 'integer' } }, required: ['image', 'version'], type: 'object' } })
  @ApiCreatedResponse({ type: RoomDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiResponse({ status: 413, type: ErrorResponseDto })
  uploadImage(@Param('id') id: string, @Body('version') version: unknown, @UploadedFile() image: { buffer: Buffer; originalname?: string } | undefined) {
    return this.rooms.replaceImage(id, version, image);
  }

  @Delete(':id/image')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Remove a room image using optimistic version' })
  @ApiBody({ type: ImageVersionDto })
  @ApiOkResponse({ type: RoomDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  removeImage(@Param('id') id: string, @Body('version') version: unknown) { return this.rooms.removeImage(id, version); }

  @Get('search')
  @ApiOperation({ summary: 'Find available rooms free for a future work-time interval' })
  @ApiQuery({ name: 'date', required: true, type: String })
  @ApiQuery({ name: 'start', required: true, type: String })
  @ApiQuery({ name: 'end', required: true, type: String })
  @ApiQuery({ name: 'minimumCapacity', required: false, type: Number })
  @ApiQuery({ name: 'floor', required: false, type: Number })
  @ApiQuery({ enum: ['tv', 'projector', 'whiteboard', 'video_conferencing'], isArray: true, name: 'equipment', required: false })
  @ApiOkResponse({ isArray: true, type: RoomDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  search(@Query() query: Record<string, unknown>, @Req() request: Request) {
    return this.rooms.search(query, request.auth!.user);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Read the room image when one has been uploaded' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiNotFoundResponse({ description: 'The room or its image does not exist.', type: ErrorResponseDto })
  image(@Param('id') id: string, @Res() response: Response): void {
    const image = this.rooms.getImage(id);
    response.type(image.mimeType).send(image.data);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Read one room schedule for a calendar day' })
  @ApiQuery({ name: 'date', required: true, type: String })
  @ApiOkResponse({ type: RoomScheduleDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  schedule(@Param('id') id: string, @Query('date') date: unknown, @Req() request: Request) {
    return this.rooms.getSchedule(id, date, request.auth!.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read room details' })
  @ApiOkResponse({ type: RoomDto })
  @ApiNotFoundResponse({ description: 'The room does not exist.', type: ErrorResponseDto })
  detail(@Param('id') id: string) {
    return this.rooms.getRoom(id);
  }
}
