import { IsEnum, IsString } from 'class-validator';
import { ChannelType } from '@message-hub/domain';

export class AddIdentifierDto {
  @IsEnum(ChannelType)
  channelType!: ChannelType;

  @IsString()
  identifierKind!: string;

  @IsString()
  value!: string;
}
