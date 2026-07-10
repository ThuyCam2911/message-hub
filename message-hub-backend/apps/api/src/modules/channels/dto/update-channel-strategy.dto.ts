import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateChannelStrategyDto {
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
