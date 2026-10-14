import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import { type ICurrentUser, type TranscriptMessage } from '../../../common/interfaces';

import { CreateLogDto } from './dto/create-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';
import { LogsService } from './logs.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiBearerAuth()
@ApiTags('Student-backend: Logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) { }

  @Post()
  @RequiredRoles(RoleSlug.STUDENT)
  create(@Body() createLogDto: CreateLogDto, @CurrentUser() currentUser: ICurrentUser) {
    return this.logsService.create(currentUser, createLogDto);
  }

  @Get()
  @RequiredRoles(RoleSlug.STUDENT)
  findAll() {
    return this.logsService.findAll();
  }

  @Get(':id')
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
  async findOne(@Param('id') id: string) {
    const log = await this.logsService.findOne(id);
    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }
    return log;
  }

  @Put(':id')
  @RequiredRoles(RoleSlug.STUDENT)
  update(@Param('id') id: string, @Body() updateLogDto: UpdateLogDto) {
    return this.logsService.update(id, updateLogDto);
  }

  @Post(':id/end')
  @RequiredRoles(RoleSlug.STUDENT)
  endLog(@Param('id') id: string) {
    return this.logsService.endLog(id);
  }

  @Post(':id/messages')
  @RequiredRoles(RoleSlug.STUDENT)
  appendMessages(@Param('id') id: string, @Body('messages') messages: TranscriptMessage[]) {
    return this.logsService.appendMessages(id, messages);
  }

  // @Post(':id/message')
  // addMessage(@Param('id') id: string, @Body() messageDto: { speaker: string; text: string; timestamp?: string }) {
  //   return this.logsService.addMessage(id, messageDto);
  // }
}
