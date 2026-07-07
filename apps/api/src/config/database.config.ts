import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '@message-hub/domain';

export function getDatabaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    // Dev-only convenience: auto-sync schema from entities so Phase 1 doesn't
    // need hand-written migrations yet. Switch to migrations before
    // production data exists (Phase 4 hardening).
    synchronize: true,
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}
