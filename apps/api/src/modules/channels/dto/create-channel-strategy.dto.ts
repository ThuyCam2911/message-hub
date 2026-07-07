import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateChannelStrategyDto {
  @IsString()
  strategyKey!: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}
