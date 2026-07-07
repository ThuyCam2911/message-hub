import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdvanceOn, FailoverPolicy, FailoverPolicyStep } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateFailoverPolicyDto } from './dto/create-failover-policy.dto';

@Injectable()
export class FailoverPoliciesService {
  constructor(
    @InjectRepository(FailoverPolicy) private readonly policies: Repository<FailoverPolicy>,
    @InjectRepository(FailoverPolicyStep) private readonly steps: Repository<FailoverPolicyStep>,
    private readonly orgs: OrganizationsService,
  ) {}

  async create(dto: CreateFailoverPolicyDto) {
    if (dto.steps.length === 0) {
      throw new BadRequestException('A failover policy needs at least one step');
    }
    const orderedSteps = [...dto.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    orderedSteps.forEach((step, index) => {
      if (step.stepOrder !== index) {
        throw new BadRequestException('steps.stepOrder must be a contiguous sequence starting at 0');
      }
    });

    const policy = await this.policies.save(
      this.policies.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        name: dto.name,
        description: dto.description,
        isActive: true,
      }),
    );

    for (const step of orderedSteps) {
      await this.steps.save(
        this.steps.create({
          failoverPolicyId: policy.id,
          stepOrder: step.stepOrder,
          channelStrategyId: step.channelStrategyId,
          timeoutSeconds: step.timeoutSeconds,
          advanceOn: step.advanceOn ?? AdvanceOn.EITHER,
        }),
      );
    }

    return this.get(policy.id);
  }

  async list() {
    const policies = await this.policies.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(policies.map((p) => this.get(p.id)));
  }

  async get(id: string) {
    const policy = await this.policies.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!policy) throw new NotFoundException(`Failover policy ${id} not found`);
    const steps = await this.steps.find({ where: { failoverPolicyId: id }, order: { stepOrder: 'ASC' } });
    return { ...policy, steps };
  }
}
