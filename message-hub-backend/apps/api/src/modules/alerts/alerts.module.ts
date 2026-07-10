import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '@message-hub/domain';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Alert]), OrganizationsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
