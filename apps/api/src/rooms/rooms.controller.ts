import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiCookieAuth('roomly_session')
@UseGuards(AuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'List every room ordered by floor and stable room ID' })
  @ApiOkResponse({ description: 'The room catalogue.' })
  list() {
    return this.rooms.listRooms();
  }

  @Get('search')
  @ApiOperation({ summary: 'Find available rooms free for a future work-time interval' })
  search(@Query() query: Record<string, unknown>, @Req() request: Request) {
    return this.rooms.search(query, request.auth!.user);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Read the room image when one has been uploaded' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiNotFoundResponse({ description: 'The room or its image does not exist.' })
  image(@Param('id') id: string, @Res() response: Response): void {
    const image = this.rooms.getImage(id);
    response.type(image.mimeType).send(image.data);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Read one room schedule for a calendar day' })
  schedule(@Param('id') id: string, @Query('date') date: unknown, @Req() request: Request) {
    return this.rooms.getSchedule(id, date, request.auth!.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read room details' })
  @ApiNotFoundResponse({ description: 'The room does not exist.' })
  detail(@Param('id') id: string) {
    return this.rooms.getRoom(id);
  }
}
