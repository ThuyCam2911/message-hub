import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateChannelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  provider?: string;

  /** Only the keys present here are changed — merged onto the existing decrypted config, not a full replace. */
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
