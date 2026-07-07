import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateChannelStrategyDto } from './dto/create-channel-strategy.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get('adapters')
  listAdapters() {
    return this.channels.listAvailableAdapters();
  }

  @Post()
  create(@Body() dto: CreateChannelDto) {
    return this.channels.create(dto);
  }

  @Get()
  list() {
    return this.channels.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.channels.get(id);
  }

  @Post(':id/strategies')
  addStrategy(@Param('id') id: string, @Body() dto: CreateChannelStrategyDto) {
    return this.channels.addStrategy(id, dto);
  }

  @Post('strategies/:strategyId/test-connection')
  testConnection(@Param('strategyId') strategyId: string) {
    return this.channels.testStrategyConnection(strategyId);
  }
}
