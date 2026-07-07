import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { FailoverEngineModule, QUEUE_DISPATCH } from '@message-hub/failover';
import { getDatabaseConfig } from './config/database.config';
import { getBullConnection } from './config/bullmq.config';
import { DispatchProcessor } from './processors/dispatch.processor';
import { AttemptProcessor } from './processors/attempt.processor';
import { TimeoutCheckProcessor } from './processors/timeout-check.processor';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    BullModule.forRoot({ connection: getBullConnection() }),
    BullModule.registerQueue({ name: QUEUE_DISPATCH }),
    FailoverEngineModule,
  ],
  providers: [DispatchProcessor, AttemptProcessor, TimeoutCheckProcessor],
})
export class WorkerModule {}
