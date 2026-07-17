import { IsObject, IsOptional, IsString } from 'class-validator';

export class SendCampaignTestDto {
  @IsString()
  phone!: string;

  @IsObject()
  @IsOptional()
  templateVariables?: Record<string, unknown>;
}
