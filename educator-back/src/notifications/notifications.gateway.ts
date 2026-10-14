import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

import { NotificationsConstants } from './notifications.constants';
import { Notification, NotificationType, RecipientType } from 'src/database/entities';
import { LoggerService } from 'src/common/services';
import { extractAccessTokenForSocket } from 'src/common/utils/token-extractor.util';
import { AuthService } from 'src/auth/auth.service';
import { ICurrentUser, IClassesTransferredNotification } from 'src/common/interfaces';
import { UserTokenType } from 'src/common/constants';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) { }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = extractAccessTokenForSocket(client);

      // Same validation the HTTP `AuthGuard` runs: signature/expiry/blacklist plus a
      // re-check that the account and role are still active.
      const user = token ? await this.authService.validateUserToken(token) : null;
      const room = user ? this.resolveRoom(user) : null;

      if (!room) {
        client.disconnect();
        return;
      }

      await client.join(room);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`WebSocket authentication failed — socketId: ${client.id} — ${errMsg}`);
      client.disconnect();
    }
  }

  handleDisconnect(): void {
    // Socket.IO removes a disconnected socket from every room automatically.
  }

  /** Maps a validated user to their notification room, or null if they have no valid identity. */
  private resolveRoom(user: ICurrentUser): string | null {
    const { ROOMS } = NotificationsConstants;

    switch (user.type) {
      case UserTokenType.STUDENT: {
        const studentCode = (user.student_id || user.studentId)?.toString();
        return studentCode ? ROOMS.STUDENT(studentCode) : null;
      }
      case UserTokenType.EDUCATOR:
        return user.educatorId ? ROOMS.EDUCATOR(user.educatorId) : null;
      case UserTokenType.ADMIN:
        return user.userId ? ROOMS.ADMIN(user.userId) : null;
      default:
        return null;
    }
  }

  private emitToRoom(room: string, eventName: string, payload: Record<string, unknown>): void {
    this.server.to(room).emit(eventName, payload);
  }

  private buildSocketPayload(notification: Notification): Record<string, unknown> {
    const payload = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      recipientId: notification.recipientId,
      recipientType: notification.recipientType,
      isRead: notification.isRead,
      metadata: notification.metadata ?? {},
      createdAt:
        notification.createdAt instanceof Date
          ? notification.createdAt.toISOString()
          : new Date(notification.createdAt).toISOString(),
    };

    return {
      ...payload,
      ...(notification.metadata ?? {}),
    };
  }

  private emitToRecipient(
    recipientType: RecipientType,
    recipientId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ): void {
    if (recipientType === RecipientType.ADMIN) {
      this.emitToRoom(NotificationsConstants.ROOMS.ADMIN(recipientId), eventName, payload);
      return;
    }
    this.emitToEducator(recipientId, eventName, payload);
  }

  private emitToEducator(
    educatorId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ): void {
    this.emitToRoom(NotificationsConstants.ROOMS.EDUCATOR(educatorId), eventName, payload);
  }

  private async persist(
    type: NotificationType,
    title: string,
    message: string,
    recipientId: string,
    recipientType: RecipientType,
    metadata?: Record<string, unknown>,
  ): Promise<Notification | null> {
    try {
      return await this.notificationsService.create({
        type,
        title,
        message,
        recipientId,
        recipientType,
        metadata,
      });

    } catch (error) {
      this.logger.error(
        `Failed to persist notification [${type}] for ${recipientId}: ${error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }


  async notifyAdminEducatorStatusUpdated(
    adminId: string,
    educatorId: string,
    educatorName: string,
    status: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.EDUCATOR_STATUS_UPDATED(educatorName, status);
    const saved = await this.persist(
      NotificationType.GENERAL,
      NotificationsConstants.TITLES.EDUCATOR_STATUS_UPDATED,
      message,
      adminId,
      RecipientType.ADMIN,
      { educatorId, educatorName, status },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.EDUCATOR_STATUS_UPDATED,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAdminEducatorInvitationAccepted(
    adminId: string,
    educatorId: string,
    educatorName: string,
    completedAtIso: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.EDUCATOR_INVITATION_ACCEPTED(
      educatorName,
      completedAtIso,
    );
    const saved = await this.persist(
      NotificationType.EDUCATOR_REGISTERED,
      NotificationsConstants.TITLES.EDUCATOR_REGISTERED,
      message,
      adminId,
      RecipientType.ADMIN,
      { educatorId, educatorName, completedAt: completedAtIso },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.EDUCATOR_REGISTERED,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAccountDeleted(educatorId: string): Promise<void> {
    const message = 'Your account has been deleted.';
    const saved = await this.persist(
      NotificationType.GENERAL,
      'Account Deleted',
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { educatorId },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        'account-deleted',
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorTokensAllocated(
    educatorId: string,
    allocatedSeats: number,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.TOKENS_ALLOCATED(allocatedSeats);
    const saved = await this.persist(
      NotificationType.TOKENS_ALLOCATED,
      NotificationsConstants.TITLES.TOKENS_ALLOCATED,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { allocatedSeats },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.TOKENS_ALLOCATED,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAdminEducatorLowSeatWarning(
    adminId: string,
    educatorId: string,
    educatorName: string,
    remainingSeats: number,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.EDUCATOR_LOW_SEAT_WARNING(
      educatorName,
      remainingSeats,
    );
    const saved = await this.persist(
      NotificationType.EDUCATOR_LOW_SEAT_WARNING,
      NotificationsConstants.TITLES.EDUCATOR_LOW_SEAT_WARNING,
      message,
      adminId,
      RecipientType.ADMIN,
      { educatorId, educatorName, remainingSeats },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.EDUCATOR_LOW_SEAT_WARNING,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAdminEducatorSeatRequest(
    adminId: string,
    educatorId: string,
    educatorName: string,
    educatorEmail: string | null,
    requestedSeats: number | null,
    remainingSeats: number,
    note?: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.EDUCATOR_SEAT_REQUEST(
      educatorName,
      requestedSeats,
      remainingSeats,
    );
    const saved = await this.persist(
      NotificationType.EDUCATOR_SEAT_REQUEST,
      NotificationsConstants.TITLES.EDUCATOR_SEAT_REQUEST,
      message,
      adminId,
      RecipientType.ADMIN,
      {
        educatorId,
        educatorName,
        educatorEmail,
        requestedSeats,
        remainingSeats,
        note: note ?? null,
      },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.EDUCATOR_SEAT_REQUEST,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAdminSchoolLowSeatWarning(
    adminId: string,
    schoolName: string,
    remainingSchoolSeats: number,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.SCHOOL_LOW_SEAT_WARNING(
      schoolName,
      remainingSchoolSeats,
    );
    const saved = await this.persist(
      NotificationType.SCHOOL_LOW_SEAT_WARNING,
      NotificationsConstants.TITLES.SCHOOL_LOW_SEAT_WARNING,
      message,
      adminId,
      RecipientType.ADMIN,
      { schoolName, remainingSchoolSeats },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.SCHOOL_LOW_SEAT_WARNING,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAdminClassCreated(
    adminId: string,
    educatorId: string,
    educatorName: string,
    classId: string,
    className: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.ADMIN_CLASS_CREATED(className, educatorName);
    const saved = await this.persist(
      NotificationType.CLASS_CREATED,
      NotificationsConstants.TITLES.CLASS_CREATED,
      message,
      adminId,
      RecipientType.ADMIN,
      { educatorId, educatorName, classId, className },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.CLASS_CREATED,
        this.buildSocketPayload(saved),
      );
    }
  }

  /** @deprecated Simulation Assigned notifications have been removed per spec. */
  notifySimulationAssigned(): void {
    /* no-op */
  }

  /** @deprecated Simulation Assigned notifications have been removed per spec. */
  notifyAdminSimulationAssigned(): void {
    /* no-op */
  }

  async notifyEducatorStudentReportAvailable(
    educatorId: string,
    studentName: string,
    simulationTitle: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const saved = await this.persist(
      NotificationType.STUDENT_REPORT_AVAILABLE,
      NotificationsConstants.TITLES.STUDENT_REPORT_AVAILABLE,
      NotificationsConstants.MESSAGES.STUDENT_REPORT_AVAILABLE(studentName, simulationTitle),
      educatorId,
      RecipientType.EDUCATOR,
      { studentName, simulationTitle, ...(metadata ?? {}) },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.STUDENT_REPORT_AVAILABLE,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorLmsGradeSyncFailed(
    educatorId: string,
    studentName: string,
    className: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const saved = await this.persist(
      NotificationType.LMS_GRADE_SYNC_FAILED,
      NotificationsConstants.TITLES.LMS_GRADE_SYNC_FAILED,
      NotificationsConstants.MESSAGES.LMS_GRADE_SYNC_FAILED(1, className, studentName),
      educatorId,
      RecipientType.EDUCATOR,
      { studentName, className, ...(metadata ?? {}) },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.LMS_GRADE_SYNC_FAILED,
        this.buildSocketPayload(saved),
      );
    }
  }


  async notifyAdminStudentReportAvailable(
    adminId: string,
    studentName: string,
    simulationTitle: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const saved = await this.persist(
      NotificationType.STUDENT_REPORT_AVAILABLE,
      NotificationsConstants.TITLES.STUDENT_REPORT_AVAILABLE,
      NotificationsConstants.MESSAGES.STUDENT_REPORT_AVAILABLE(studentName, simulationTitle),
      adminId,
      RecipientType.ADMIN,
      { studentName, simulationTitle, ...(metadata ?? {}) },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.STUDENT_REPORT_AVAILABLE,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorSimulationStartDateReminder(
    educatorId: string,
    simulationId: string,
    simulationTitle: string,
    classId: string,
    className: string,
    startDate: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.SIMULATION_START_DATE_REMINDER(
      simulationTitle,
      className,
      startDate,
    );
    const saved = await this.persist(
      NotificationType.SIMULATION_START_DATE_REMINDER,
      NotificationsConstants.TITLES.SIMULATION_START_DATE_REMINDER,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { simulationId, simulationTitle, classId, className, startDate },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.SIMULATION_START_DATE_REMINDER,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorSimulationEndDateReminder(
    educatorId: string,
    simulationId: string,
    simulationTitle: string,
    classId: string,
    className: string,
    endDate: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.SIMULATION_END_DATE_REMINDER(
      simulationTitle,
      className,
      endDate,
    );
    const saved = await this.persist(
      NotificationType.SIMULATION_END_DATE_REMINDER,
      NotificationsConstants.TITLES.SIMULATION_END_DATE_REMINDER,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { simulationId, simulationTitle, classId, className, endDate },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.SIMULATION_END_DATE_REMINDER,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorClassStartDateReminder(
    educatorId: string,
    classId: string,
    className: string,
    startDate: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.CLASS_START_DATE_REMINDER(className, startDate);
    const saved = await this.persist(
      NotificationType.CLASS_START_DATE_REMINDER,
      NotificationsConstants.TITLES.CLASS_START_DATE_REMINDER,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { classId, className, startDate },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.CLASS_START_DATE_REMINDER,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorClassEndDateReminder(
    educatorId: string,
    classId: string,
    className: string,
    endDate: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.CLASS_END_DATE_REMINDER(className, endDate);
    const saved = await this.persist(
      NotificationType.CLASS_END_DATE_REMINDER,
      NotificationsConstants.TITLES.CLASS_END_DATE_REMINDER,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { classId, className, endDate },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.CLASS_END_DATE_REMINDER,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorSimulationDueDateReminder(
    educatorId: string,
    simulationId: string,
    simulationTitle: string,
    classId: string,
    className: string,
    dueDate: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.SIMULATION_DUE_DATE_REMINDER(
      simulationTitle,
      className,
      dueDate,
    );
    const saved = await this.persist(
      NotificationType.SIMULATION_DUE_DATE_REMINDER,
      NotificationsConstants.TITLES.SIMULATION_DUE_DATE_REMINDER,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { simulationId, simulationTitle, classId, className, dueDate },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.SIMULATION_DUE_DATE_REMINDER,
        this.buildSocketPayload(saved),
      );
    }
  }

  notifyEducatorSchoolDeactivated(educatorId: string, schoolName: string): void {
    this.emitToEducator(educatorId, 'school-deactivated', {
      message: `Your school "${schoolName}" has been deactivated.`,
    });
    this.logger.log(`[notifyEducatorSchoolDeactivated] Fanned out to educator ${educatorId}`);
  }

  notifyEducatorSchoolRemoved(educatorId: string): void {
    this.emitToEducator(educatorId, NotificationsConstants.EVENTS.EDUCATOR_SCHOOL_REMOVED, {});
    this.logger.log(`[notifyEducatorSchoolRemoved] Fanned out to educator ${educatorId}`);
  }

  notifyEducatorSchoolAdded(educatorId: string): void {
    this.emitToEducator(educatorId, NotificationsConstants.EVENTS.EDUCATOR_SCHOOL_ADDED, {});
    this.logger.log(`[notifyEducatorSchoolAdded] Fanned out to educator ${educatorId}`);
  }

  notifyEducatorSchoolStatusChanged(educatorId: string): void {
    this.emitToEducator(educatorId, NotificationsConstants.EVENTS.SCHOOL_STATUS_CHANGED, {});
    this.logger.log(`[notifyEducatorSchoolStatusChanged] Fanned out to educator ${educatorId}`);
  }

  notifyAccountDeactivated(educatorId: string): void {
    this.emitToEducator(educatorId, 'account-deactivated', {});
    this.logger.log(`[notifyAccountDeactivated] Fanned out to educator ${educatorId}`);
  }

  notifyStudentSimulationsUpdated(studentCode: string, scenarioId: string): void {
    this.emitToRoom(
      NotificationsConstants.ROOMS.STUDENT(studentCode),
      NotificationsConstants.EVENTS.STUDENT_SIMULATIONS_UPDATED,
      { scenarioId, status: 'Assessment completed' },
    );
  }

  async notifyClassTransferSourceEducator(
    sourceEducatorId: string,
    classId: string,
    className: string,
    targetEducatorName: string,
    transferredAt: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.CLASS_TRANSFERRED_SOURCE(
      className,
      targetEducatorName,
      transferredAt,
    );

    const saved = await this.persist(
      NotificationType.CLASS_TRANSFERRED,
      NotificationsConstants.TITLES.CLASS_TRANSFERRED_SOURCE,
      message,
      sourceEducatorId,
      RecipientType.EDUCATOR,
      { classId, className, targetEducatorName, transferredAt },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        sourceEducatorId,
        NotificationsConstants.EVENTS.CLASS_TRANSFERRED_SOURCE,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyClassTransferTargetEducator(
    targetEducatorId: string,
    classId: string,
    className: string,
    sourceEducatorName: string,
    transferredAt: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.CLASS_TRANSFERRED_TARGET(
      className,
      sourceEducatorName,
      transferredAt,
    );
    const saved = await this.persist(
      NotificationType.CLASS_TRANSFERRED,
      NotificationsConstants.TITLES.CLASS_TRANSFERRED_TARGET,
      message,
      targetEducatorId,
      RecipientType.EDUCATOR,
      { classId, className, sourceEducatorName, transferredAt },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        targetEducatorId,
        NotificationsConstants.EVENTS.CLASS_TRANSFERRED_TARGET,
        this.buildSocketPayload(saved),
      );
    }
  }

  /** One summary to the educator a bulk Class Transfer moved classes away from. */
  async notifyClassesTransferredSource(
    sourceEducatorId: string,
    summary: IClassesTransferredNotification,
  ): Promise<void> {
    await this.notifyClassesTransferred(
      sourceEducatorId,
      NotificationsConstants.TITLES.CLASSES_TRANSFERRED_SOURCE,
      NotificationsConstants.MESSAGES.CLASSES_TRANSFERRED_SOURCE(
        summary.classIds.length,
        summary.otherEducatorName,
      ),
      NotificationsConstants.EVENTS.CLASSES_TRANSFERRED_SOURCE,
      summary,
    );
  }

  /** One summary to the educator a bulk Class Transfer moved classes to. */
  async notifyClassesTransferredTarget(
    targetEducatorId: string,
    summary: IClassesTransferredNotification,
  ): Promise<void> {
    await this.notifyClassesTransferred(
      targetEducatorId,
      NotificationsConstants.TITLES.CLASSES_TRANSFERRED_TARGET,
      NotificationsConstants.MESSAGES.CLASSES_TRANSFERRED_TARGET(
        summary.classIds.length,
        summary.otherEducatorName,
      ),
      NotificationsConstants.EVENTS.CLASSES_TRANSFERRED_TARGET,
      summary,
    );
  }

  private async notifyClassesTransferred(
    educatorId: string,
    title: string,
    message: string,
    eventName: string,
    summary: IClassesTransferredNotification,
  ): Promise<void> {
    const saved = await this.persist(
      NotificationType.CLASS_TRANSFERRED,
      title,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { ...summary, count: summary.classIds.length },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        eventName,
        this.buildSocketPayload(saved),
      );
    }
  }
}
