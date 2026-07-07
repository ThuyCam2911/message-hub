import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { MessageAttempt, MessageRequest } from '@message-hub/domain';
import { DispatchJobData, QUEUE_DISPATCH } from '@message-hub/failover';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateMessageRequestDto } from './dto/create-message-request.dto';

@Injectable()
export class MessageRequestsService {
  constructor(
    @InjectRepository(MessageRequest) private readonly requests: Repository<MessageRequest>,
    @InjectRepository(MessageAttempt) private readonly attempts: Repository<MessageAttempt>,
    @InjectQueue(QUEUE_DISPATCH) private readonly dispatchQueue: Queue<DispatchJobData>,
    private readonly orgs: OrganizationsService,
  ) {}

  async create(dto: CreateMessageRequestDto) {
    const request = await this.requests.save(
      this.requests.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        contactId: dto.contactId,
        templateId: dto.templateId,
        failoverPolicyId: dto.failoverPolicyId,
        templateVariables: dto.templateVariables ?? {},
      }),
    );
    await this.dispatchQueue.add('dispatch', { messageRequestId: request.id });
    return request;
  }

  list() {
    return this.requests.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async get(id: string) {
    const request = await this.requests.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!request) throw new NotFoundException(`Message request ${id} not found`);
    const attempts = await this.attempts.find({ where: { messageRequestId: id }, order: { createdAt: 'ASC' } });
    return { ...request, attempts };
  }
}
