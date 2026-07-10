import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '@message-hub/domain';
import { AlertsCronService } from './alerts-cron.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alert])],
  providers: [AlertsCronService],
})
export class AlertsModule {}
