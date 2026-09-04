import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';
import { NotificationsConstants } from './notifications.constants';
import { Notification, RecipientType } from './entity/notification.entity';

interface AuthRequest extends ExpressRequest {
  user: {
    userId: string;
    email: string;
    roles: string[];
    type: RecipientType;
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller(NotificationsConstants.ROUTES.BASE)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private getRecipientType(req: AuthRequest): RecipientType {
    return req.user.type === RecipientType.EDUCATOR ? RecipientType.EDUCATOR : RecipientType.ADMIN;
  }

  @Get()
  async getAll(@Request() req: AuthRequest): Promise<Notification[]> {
    return this.notificationsService.findAllForRecipient(
      req.user.userId,
      this.getRecipientType(req),
    );
  }

  @Get(NotificationsConstants.ROUTES.UNREAD_COUNT)
  async getUnreadCount(@Request() req: AuthRequest): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(
      req.user.userId,
      this.getRecipientType(req),
    );
    return { count };
  }

  @Patch(NotificationsConstants.ROUTES.MARK_READ)
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ): Promise<Notification> {
    return this.notificationsService.markAsRead(id, req.user.userId, this.getRecipientType(req));
  }

  @Patch(NotificationsConstants.ROUTES.MARK_UNREAD)
  @HttpCode(HttpStatus.OK)
  async markAsUnread(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ): Promise<Notification> {
    return this.notificationsService.markAsUnread(id, req.user.userId, this.getRecipientType(req));
  }

  @Patch(NotificationsConstants.ROUTES.MARK_ALL_READ)
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req: AuthRequest): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsRead(req.user.userId, this.getRecipientType(req));
  }

  @Patch(NotificationsConstants.ROUTES.MARK_ALL_UNREAD)
  @HttpCode(HttpStatus.OK)
  async markAllAsUnread(@Request() req: AuthRequest): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsUnread(req.user.userId, this.getRecipientType(req));
  }

  @Delete(NotificationsConstants.ROUTES.BY_ID)
  @HttpCode(HttpStatus.OK)
  async deleteOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ): Promise<{ deleted: boolean }> {
    return this.notificationsService.deleteOne(id, req.user.userId, this.getRecipientType(req));
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteAll(@Request() req: AuthRequest): Promise<{ deleted: number }> {
    return this.notificationsService.deleteAll(req.user.userId, this.getRecipientType(req));
  }
}
