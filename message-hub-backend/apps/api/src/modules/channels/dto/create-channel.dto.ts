import { IsEnum, IsObject, IsString } from 'class-validator';
import { ChannelType } from '@message-hub/domain';

export class CreateChannelDto {
  @IsEnum(ChannelType)
  channelType!: ChannelType;

  @IsString()
  name!: string;

  @IsString()
  provider!: string;

  @IsObject()
  config!: Record<string, unknown>;
}
