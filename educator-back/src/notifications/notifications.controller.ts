import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService, UpsertPreferenceDto } from './notifications.service';
import { NotificationsConstants } from './notifications.constants';
import { Notification, RecipientType } from 'src/database/entities';
import { NotificationPreference } from '../database/entities/notification-preference.entity';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';

interface AuthRequest extends ExpressRequest {
  user: {
    userId: string;
    /** The linked Educator profile's own id — present only on EDUCATOR-type tokens. */
    educatorId?: string;
    email: string;
    roles: RoleSlug[];
    type: UserTokenType;
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller(NotificationsConstants.ROUTES.BASE)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) { }

  private getRecipientType(req: AuthRequest): RecipientType {
    return req.user.type === UserTokenType.EDUCATOR ? RecipientType.EDUCATOR : RecipientType.ADMIN;
  }

  /**
  * The per-recipient-type key: an `educators.id` for EDUCATOR, the admin's `users.id` for
  * ADMIN. Both `notifications.recipient_id` and `notification_preferences.user_id` are written
  * with it — `NotificationsGateway` persists educator notifications against the `educators.id`,
  * and the report-email path reads preferences with the same `educators.id`
  * (`SimulationReportsService.notifyEducatorReportAvailable`).
  *
  * Both columns are plain varchars with no FK, so reading them with the wrong id returns
  * nothing instead of erroring — and for preferences that silently reads as "disabled", since
  * `isPreferenceEnabled` defaults to false. It must be paired with `getRecipientType` at every
  * call site.
  */
  private getRecipientId(req: AuthRequest): string {
    return this.getRecipientType(req) === RecipientType.EDUCATOR
      ? (req.user.educatorId ?? '')
      : req.user.userId;
  }

  @Get()
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  async getAll(@Request() req: AuthRequest): Promise<Notification[]> {
    return this.notificationsService.findAllForRecipient(
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Get(NotificationsConstants.ROUTES.UNREAD_COUNT)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  async getUnreadCount(@Request() req: AuthRequest): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
    return { count };
  }

  @Patch(NotificationsConstants.ROUTES.MARK_READ)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ): Promise<Notification> {
    return this.notificationsService.markAsRead(
      id,
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Patch(NotificationsConstants.ROUTES.MARK_UNREAD)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async markAsUnread(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ): Promise<Notification> {
    return this.notificationsService.markAsUnread(
      id,
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Patch(NotificationsConstants.ROUTES.MARK_ALL_READ)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req: AuthRequest): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsRead(
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Patch(NotificationsConstants.ROUTES.MARK_ALL_UNREAD)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async markAllAsUnread(@Request() req: AuthRequest): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsUnread(
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Delete(NotificationsConstants.ROUTES.BY_ID)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ): Promise<{ deleted: boolean }> {
    return this.notificationsService.deleteOne(
      id,
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Delete()
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteAll(@Request() req: AuthRequest): Promise<{ deleted: number }> {
    return this.notificationsService.deleteAll(
      this.getRecipientId(req),
      this.getRecipientType(req),
    );
  }

  @Get(NotificationsConstants.ROUTES.PREFERENCES)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  async getPreferences(@Request() req: AuthRequest): Promise<NotificationPreference[]> {
    return this.notificationsService.getPreferences(this.getRecipientId(req));
  }

  @Put(NotificationsConstants.ROUTES.PREFERENCES)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @HttpCode(HttpStatus.OK)
  async upsertPreferences(
    @Request() req: AuthRequest,
    @Body() body: { preferences: UpsertPreferenceDto[] },
  ): Promise<NotificationPreference[]> {
    return this.notificationsService.upsertPreferences(
      this.getRecipientId(req),
      body.preferences ?? [],
      this.getRecipientType(req),
      req.user.email,
    );
  }
}
