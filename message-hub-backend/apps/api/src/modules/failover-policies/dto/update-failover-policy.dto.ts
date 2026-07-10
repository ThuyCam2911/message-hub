import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { FailoverPolicyStepDto } from './create-failover-policy.dto';

export class UpdateFailoverPolicyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Only allowed while the policy has never been used by a message request — replaces the full step list. */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FailoverPolicyStepDto)
  steps?: FailoverPolicyStepDto[];
}
