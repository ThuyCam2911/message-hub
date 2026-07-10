import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MessageRequestsService } from './message-requests.service';
import { CreateMessageRequestDto } from './dto/create-message-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('message-requests')
export class MessageRequestsController {
  constructor(private readonly messageRequests: MessageRequestsService) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  create(@Body() dto: CreateMessageRequestDto) {
    return this.messageRequests.create(dto);
  }

  @Get()
  list() {
    return this.messageRequests.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.messageRequests.get(id);
  }
}
