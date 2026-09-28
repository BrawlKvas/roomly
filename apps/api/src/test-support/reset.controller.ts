import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type Database from 'better-sqlite3';
import { createRequire } from 'node:module';

import { DatabaseService } from '../database/database.service';

interface ReferenceDataModule {
  seedDatabase(sqlite: Database.Database, options: { reset: true }): Promise<void>;
}

const { seedDatabase } = createRequire(__filename)(
  '../../scripts/reference-data.mjs',
) as ReferenceDataModule;

@ApiTags('test')
@Controller('test')
export class ResetController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post('reset')
  @HttpCode(204)
  @ApiOperation({ summary: 'Restore the reference database state for tests' })
  @ApiNoContentResponse({ description: 'The database has been reset.' })
  async reset(): Promise<void> {
    await seedDatabase(this.database.sqlite, { reset: true });
  }
}
