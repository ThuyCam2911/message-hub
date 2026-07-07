import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MessageRequestsService } from './message-requests.service';
import { CreateMessageRequestDto } from './dto/create-message-request.dto';

@Controller('message-requests')
export class MessageRequestsController {
  constructor(private readonly messageRequests: MessageRequestsService) {}

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
