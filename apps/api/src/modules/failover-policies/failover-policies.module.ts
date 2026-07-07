import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FailoverPolicy, FailoverPolicyStep } from '@message-hub/domain';
import { OrganizationsModule } from '../organizations/organizations.module';
import { FailoverPoliciesService } from './failover-policies.service';
import { FailoverPoliciesController } from './failover-policies.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FailoverPolicy, FailoverPolicyStep]), OrganizationsModule],
  controllers: [FailoverPoliciesController],
  providers: [FailoverPoliciesService],
  exports: [FailoverPoliciesService],
})
export class FailoverPoliciesModule {}
