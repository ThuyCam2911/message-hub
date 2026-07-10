import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class TriggerCampaignDto {
  @IsBoolean()
  @IsOptional()
  allContacts?: boolean;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  contactIds?: string[];
}
