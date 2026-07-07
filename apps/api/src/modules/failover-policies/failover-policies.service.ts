import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdvanceOn, FailoverPolicy, FailoverPolicyStep, MessageRequest } from '@message-hub/domain';
import { isForeignKeyViolation } from '../../common/db-errors';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateFailoverPolicyDto, FailoverPolicyStepDto } from './dto/create-failover-policy.dto';
import { UpdateFailoverPolicyDto } from './dto/update-failover-policy.dto';

export interface MutationOutcome {
  deleted: boolean;
  deactivated: boolean;
}

@Injectable()
export class FailoverPoliciesService {
  constructor(
    @InjectRepository(FailoverPolicy) private readonly policies: Repository<FailoverPolicy>,
    @InjectRepository(FailoverPolicyStep) private readonly steps: Repository<FailoverPolicyStep>,
    @InjectRepository(MessageRequest) private readonly requests: Repository<MessageRequest>,
    private readonly orgs: OrganizationsService,
  ) {}

  async create(dto: CreateFailoverPolicyDto) {
    const orderedSteps = this.validateAndOrderSteps(dto.steps);

    const policy = await this.policies.save(
      this.policies.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        name: dto.name,
        description: dto.description,
        isActive: true,
      }),
    );

    await this.saveSteps(policy.id, orderedSteps);
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
    const policy = await this.findRawOrThrow(id);
    const steps = await this.steps.find({ where: { failoverPolicyId: id }, order: { stepOrder: 'ASC' } });
    return { ...policy, steps };
  }

  async update(id: string, dto: UpdateFailoverPolicyDto) {
    await this.findRawOrThrow(id);
    const patch: Partial<FailoverPolicy> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (Object.keys(patch).length > 0) {
      await this.policies.update(id, patch);
    }

    if (dto.steps) {
      const inUse = await this.requests.count({ where: { failoverPolicyId: id } });
      if (inUse > 0) {
        throw new BadRequestException(
          'Policy đã được dùng để gửi tin nhắn — không thể sửa các bước. Hãy tạo policy mới nếu cần đổi luồng failover.',
        );
      }
      const orderedSteps = this.validateAndOrderSteps(dto.steps);
      await this.steps.delete({ failoverPolicyId: id });
      await this.saveSteps(id, orderedSteps);
    }

    return this.get(id);
  }

  /** Falls back to deactivating when the policy (or one of its steps) is already referenced by a campaign/message. */
  async remove(id: string): Promise<MutationOutcome> {
    await this.findRawOrThrow(id);
    try {
      await this.policies.delete(id);
      return { deleted: true, deactivated: false };
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      await this.policies.update(id, { isActive: false });
      return { deleted: false, deactivated: true };
    }
  }

  private validateAndOrderSteps(steps: FailoverPolicyStepDto[]): FailoverPolicyStepDto[] {
    if (steps.length === 0) {
      throw new BadRequestException('A failover policy needs at least one step');
    }
    const orderedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    orderedSteps.forEach((step, index) => {
      if (step.stepOrder !== index) {
        throw new BadRequestException('steps.stepOrder must be a contiguous sequence starting at 0');
      }
    });
    return orderedSteps;
  }

  private async saveSteps(policyId: string, orderedSteps: FailoverPolicyStepDto[]) {
    for (const step of orderedSteps) {
      await this.steps.save(
        this.steps.create({
          failoverPolicyId: policyId,
          stepOrder: step.stepOrder,
          channelStrategyId: step.channelStrategyId,
          timeoutSeconds: step.timeoutSeconds,
          advanceOn: step.advanceOn ?? AdvanceOn.EITHER,
        }),
      );
    }
  }

  private async findRawOrThrow(id: string): Promise<FailoverPolicy> {
    const policy = await this.policies.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!policy) throw new NotFoundException(`Failover policy ${id} not found`);
    return policy;
  }
}
