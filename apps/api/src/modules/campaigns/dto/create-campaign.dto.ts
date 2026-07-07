import { IsString } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsString()
  templateId!: string;

  @IsString()
  failoverPolicyId!: string;
}
