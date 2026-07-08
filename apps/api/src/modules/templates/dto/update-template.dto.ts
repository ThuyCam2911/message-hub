import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  // @IsOptional() alone is correct here: it already skips validation (and
  // treats the field as "not provided") when the value is undefined OR
  // null, so pairing it with @IsDefined() was dead code — IsDefined can
  // never fire in either case.
  @IsOptional()
  body?: string | Record<string, unknown>;

  @IsArray()
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
