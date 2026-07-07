import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { AdvanceOn } from '@message-hub/domain';

export class FailoverPolicyStepDto {
  @IsInt()
  @Min(0)
  stepOrder!: number;

  @IsString()
  channelStrategyId!: string;

  @IsInt()
  @IsOptional()
  timeoutSeconds?: number;

  @IsEnum(AdvanceOn)
  @IsOptional()
  advanceOn?: AdvanceOn;
}

export class CreateFailoverPolicyDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FailoverPolicyStepDto)
  steps!: FailoverPolicyStepDto[];
}
