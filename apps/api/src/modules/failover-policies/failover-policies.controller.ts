import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FailoverPoliciesService } from './failover-policies.service';
import { CreateFailoverPolicyDto } from './dto/create-failover-policy.dto';

@Controller('failover-policies')
export class FailoverPoliciesController {
  constructor(private readonly policies: FailoverPoliciesService) {}

  @Post()
  create(@Body() dto: CreateFailoverPolicyDto) {
    return this.policies.create(dto);
  }

  @Get()
  list() {
    return this.policies.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.policies.get(id);
  }
}
