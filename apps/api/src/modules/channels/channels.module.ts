import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, ChannelStrategy } from '@message-hub/domain';
import { AdaptersModule } from '@message-hub/adapters';
import { EncryptionService } from '@message-hub/shared';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, ChannelStrategy]), AdaptersModule, OrganizationsModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, EncryptionService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
