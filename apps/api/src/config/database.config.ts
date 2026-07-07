import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { ALL_ENTITIES } from '@message-hub/domain';

export function getDatabaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    // __dirname is src/config (ts-node/dev) or dist/config (compiled/prod) —
    // migrations sit one level up from both, compiled alongside this file.
    migrations: [join(__dirname, '../migrations/*.{ts,js}')],
    migrationsRun: true,
    synchronize: false,
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}
