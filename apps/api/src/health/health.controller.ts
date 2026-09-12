import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthResponseDto } from '../openapi/api-contract.dto';

export interface HealthResponse {
  status: 'ok';
}

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API availability' })
  @ApiOkResponse({
    description: 'The API is ready to accept requests.',
    type: HealthResponseDto,
  })
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
