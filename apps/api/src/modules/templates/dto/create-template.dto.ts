import { IsArray, IsDefined, IsEnum, IsOptional, IsString } from 'class-validator';
import { ChannelType } from '@message-hub/domain';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ChannelType)
  channelType!: ChannelType;

  /**
   * string for plain-text channels (SMS/Telegram/Line), object for structured
   * (email {subject,html}, WhatsApp/ZNS params). @IsDefined (rather than a
   * type-specific decorator) keeps ValidationPipe's whitelist from stripping
   * this field while still accepting either shape.
   */
  @IsDefined()
  body!: string | Record<string, unknown>;

  @IsArray()
  @IsOptional()
  variables?: string[];
}
