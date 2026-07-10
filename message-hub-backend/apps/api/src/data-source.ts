import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });

import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '@message-hub/domain';

/**
 * CLI-only DataSource (migration:generate / migration:run / migration:revert).
 * The running app uses config/database.config.ts instead — kept separate
 * because the TypeORM CLI wants a plain DataSource export, not a NestJS
 * module.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: [resolve(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
});
