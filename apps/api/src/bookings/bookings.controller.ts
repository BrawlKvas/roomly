import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@ApiCookieAuth('roomly_session')
@UseGuards(AuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a booking owned by the current user' })
  @ApiBody({ schema: { example: { roomId: 'room-atlas', subject: 'Планирование', description: 'Необязательно', participants: 3, date: '2026-10-05', start: '10:00', end: '11:00' } } })
  create(@Body() values: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.create(values, request.auth!.user);
  }

  @Get('my')
  @ApiOperation({ summary: 'List current user bookings with view and date/status filters' })
  listMine(@Query() query: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.listMine(query, request.auth!.user);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Read up to five current user active upcoming bookings' })
  upcoming(@Req() request: Request) {
    return this.bookings.upcoming(request.auth!.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a booking; administrators may read any booking' })
  detail(@Param('id') id: string, @Req() request: Request) {
    return this.bookings.detail(id, request.auth!.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a current user future booking using its optimistic version' })
  update(@Param('id') id: string, @Body() values: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.update(id, values, request.auth!.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a current user future booking using its optimistic version' })
  cancel(@Param('id') id: string, @Body() values: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.cancel(id, values, request.auth!.user);
  }
}
