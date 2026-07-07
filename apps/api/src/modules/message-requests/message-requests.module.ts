import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MessageAttempt, MessageRequest } from '@message-hub/domain';
import { QUEUE_DISPATCH } from '@message-hub/failover';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MessageRequestsService } from './message-requests.service';
import { MessageRequestsController } from './message-requests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MessageRequest, MessageAttempt]),
    BullModule.registerQueue({ name: QUEUE_DISPATCH }),
    OrganizationsModule,
  ],
  controllers: [MessageRequestsController],
  providers: [MessageRequestsService],
  exports: [MessageRequestsService],
})
export class MessageRequestsModule {}
