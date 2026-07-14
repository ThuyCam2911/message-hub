import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingEvent } from '@message-hub/domain';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrackingEvent])],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
