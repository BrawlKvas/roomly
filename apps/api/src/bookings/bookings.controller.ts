import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { BookingCancellationDto, BookingDetailDto, BookingMutationDto, BookingOwnerDto, BookingSummaryDto, BookingUpdateDto, ErrorResponseDto } from '../openapi/api-contract.dto';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@ApiCookieAuth('roomly_session')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a booking owned by the current user' })
  @ApiBody({ type: BookingMutationDto })
  @ApiCreatedResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  create(@Body() values: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.create(values, request.auth!.user);
  }

  @Get('my')
  @ApiOperation({ summary: 'List current user bookings with view and date/status filters' })
  @ApiQuery({ enum: ['upcoming', 'current', 'past', 'cancelled', 'all'], name: 'view', required: false })
  @ApiQuery({ enum: ['scheduled', 'completed', 'cancelled', 'all'], name: 'status', required: false })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiOkResponse({ isArray: true, type: BookingSummaryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listMine(@Query() query: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.listMine(query, request.auth!.user);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Read up to five current user active upcoming bookings' })
  @ApiOkResponse({ isArray: true, type: BookingSummaryDto })
  upcoming(@Req() request: Request) {
    return this.bookings.upcoming(request.auth!.user);
  }

  @Get('admin/all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List every booking for administrators' })
  @ApiQuery({ name: 'roomId', required: false, type: String })
  @ApiQuery({ name: 'ownerId', required: false, type: String })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ enum: ['scheduled', 'completed', 'cancelled', 'all'], name: 'status', required: false })
  @ApiOkResponse({ isArray: true, type: BookingSummaryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  listAll(@Query() query: Record<string, unknown>, @Req() request: Request) { return this.bookings.listAll(query, request.auth!.user); }

  @Get('admin/owners')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List booking owners for the administrative filter' })
  @ApiOkResponse({ isArray: true, type: BookingOwnerDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  owners(@Req() request: Request) { return this.bookings.listOwners(request.auth!.user); }

  @Get(':id')
  @ApiOperation({ summary: 'Read a booking; administrators may read any booking' })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  detail(@Param('id') id: string, @Req() request: Request) {
    return this.bookings.detail(id, request.auth!.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a current user future booking using its optimistic version' })
  @ApiBody({ type: BookingUpdateDto })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(@Param('id') id: string, @Body() values: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.update(id, values, request.auth!.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a current user future booking using its optimistic version' })
  @ApiBody({ type: BookingCancellationDto })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  cancel(@Param('id') id: string, @Body() values: Record<string, unknown>, @Req() request: Request) {
    return this.bookings.cancel(id, values, request.auth!.user);
  }
}
