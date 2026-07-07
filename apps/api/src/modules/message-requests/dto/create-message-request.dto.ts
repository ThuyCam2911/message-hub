import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateMessageRequestDto {
  @IsString()
  contactId!: string;

  @IsString()
  templateId!: string;

  @IsString()
  failoverPolicyId!: string;

  @IsObject()
  @IsOptional()
  templateVariables?: Record<string, unknown>;
}
