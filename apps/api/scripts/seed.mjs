import { openDatabase } from './database.mjs';
import { seedDatabase } from './reference-data.mjs';

const sqlite = openDatabase();

try {
  await seedDatabase(sqlite);
  console.info('Reference data has been seeded.');
} finally {
  sqlite.close();
}
