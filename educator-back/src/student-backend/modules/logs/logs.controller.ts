import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ScenarioAuthGuard } from '../../guards/scenario-auth.guard';

import { type Transcript } from '../../data/json-data.service';

import { CreateLogDto } from './dto/create-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';
import { LogsService } from './logs.service';

@ApiBearerAuth()
@ApiTags('Student-backend: Logs')
@UseGuards(ScenarioAuthGuard)
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  create(@Body() createLogDto: CreateLogDto) {
    return this.logsService.create(createLogDto);
  }

  @Get()
  findAll() {
    return this.logsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const log = await this.logsService.findOne(id);
    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }
    return log;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateLogDto: UpdateLogDto) {
    return this.logsService.update(id, updateLogDto);
  }

  @Post(':id/end')
  endLog(@Param('id') id: string) {
    return this.logsService.endLog(id);
  }

  @Post(':id/messages')
  appendMessages(@Param('id') id: string, @Body('messages') messages: Transcript['messages']) {
    return this.logsService.appendMessages(id, messages);
  }

  // @Post(':id/message')
  // addMessage(@Param('id') id: string, @Body() messageDto: { speaker: string; text: string; timestamp?: string }) {
  //   return this.logsService.addMessage(id, messageDto);
  // }
}
