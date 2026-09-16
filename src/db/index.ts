import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import type { Database } from './types.js';

export function createDatabase(connectionString: string): Kysely<Database> {
  const pool = new Pool({
    connectionString,
    max: 10,
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}
