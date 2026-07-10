import { IsArray, IsDefined, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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

  /**
   * Manually-declared variables, merged with whatever {{var}} tokens are
   * auto-extracted from `body` — you don't have to list ones already used
   * in the body text.
   */
  @IsArray()
  @IsOptional()
  variables?: string[];

  /**
   * If set, the template is submitted to this channel's provider for
   * approval (only channels whose adapter implements submitTemplate, e.g.
   * WhatsApp — Zalo ZNS has no such API and will reject this with a clear
   * error asking you to use Sync instead).
   */
  @IsUUID()
  @IsOptional()
  sourceChannelId?: string;
}
