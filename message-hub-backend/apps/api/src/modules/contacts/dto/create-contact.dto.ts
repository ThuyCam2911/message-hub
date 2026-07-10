import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsString()
  displayName!: string;

  @IsString()
  @IsOptional()
  externalRef?: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, unknown>;
}
