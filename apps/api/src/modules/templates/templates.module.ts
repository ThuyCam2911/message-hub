import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from '@message-hub/domain';
import { TemplateRenderer } from '@message-hub/shared';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Template]), OrganizationsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplateRenderer],
  exports: [TemplatesService],
})
export class TemplatesModule {}
