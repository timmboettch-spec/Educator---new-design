import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType, RecipientType } from './entity/notification.entity';
import { NotificationsConstants } from './notifications.constants';

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

  private readonly logger = new Logger(NotificationsGateway.name);

  private educatorSockets = new Map<string, Set<string>>();
  private adminSockets = new Map<string, string>();
  private studentSockets = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
      const socketId = this.adminSockets.get(recipientId);
      if (socketId) {
        this.server.to(socketId).emit(eventName, payload);
      }
      return;
    }
    this.emitToEducator(recipientId, eventName, payload);
  }

  private emitToEducator(
    educatorId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ): void {
    const socketIds = this.educatorSockets.get(educatorId);
    if (!socketIds || socketIds.size === 0) {
      this.logger.warn(
        `[RCA][emitToEducator] NO SOCKETS registered for educator=${educatorId} event=${eventName} — event DROPPED`,
      );
      return;
    }
    this.logger.warn(
      `[RCA][emitToEducator] educator=${educatorId} event=${eventName} → ${socketIds.size} socket(s): ${JSON.stringify(Array.from(socketIds))}`,
    );
    for (const socketId of socketIds) {
      this.server.to(socketId).emit(eventName, payload);
    }
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
        `Failed to persist notification [${type}] for ${recipientId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  handleConnection(client: Socket): void {
    try {
      const studentCode = client.handshake.auth?.studentCode as string | undefined;
      if (studentCode) {
        const sanitised = studentCode.trim();
        if (!sanitised || sanitised.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(sanitised)) {
          client.disconnect();
          return;
        }
        this.studentSockets.set(sanitised, client.id);
        this.logger.log(
          `[handleConnection] Student socket registered — code: ${sanitised} socketId: ${client.id}`,
        );
        return;
      }

      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify<{ sub: string; type: string }>(token, {
        secret,
      });

      if (payload.type === 'educator') {
        const educatorId = payload.sub;
        let set = this.educatorSockets.get(educatorId);
        if (!set) {
          set = new Set<string>();
          this.educatorSockets.set(educatorId, set);
        }
        set.add(client.id);
        this.logger.warn(
          `[RCA][handleConnection] Educator socket REGISTERED — educator=${educatorId} socketId=${client.id} totalSocketsForEducator=${set.size}`,
        );
      } else if (payload.type === 'admin') {
        const adminId = payload.sub;
        this.adminSockets.set(adminId, client.id);
      } else {
        client.disconnect();
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`WebSocket authentication failed — socketId: ${client.id} — ${errMsg}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    for (const [studentCode, socketId] of this.studentSockets.entries()) {
      if (socketId === client.id) {
        this.studentSockets.delete(studentCode);
        break;
      }
    }
    for (const [educatorId, socketIds] of this.educatorSockets.entries()) {
      if (socketIds.delete(client.id)) {
        if (socketIds.size === 0) {
          this.educatorSockets.delete(educatorId);
        }
        break;
      }
    }
    for (const [adminId, socketId] of this.adminSockets.entries()) {
      if (socketId === client.id) {
        this.adminSockets.delete(adminId);
        break;
      }
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
    educatorEmail: string,
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

  async notifySimulationAssigned(
    educatorId: string,
    classId: string,
    className: string,
    simulationId: string,
    simulationTitle: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.SIMULATION_ASSIGNED(className, simulationTitle);
    const saved = await this.persist(
      NotificationType.SIMULATION_ASSIGNED,
      NotificationsConstants.TITLES.SIMULATION_ASSIGNED,
      message,
      educatorId,
      RecipientType.EDUCATOR,
      { classId, className, simulationId, simulationTitle },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.EDUCATOR,
        educatorId,
        NotificationsConstants.EVENTS.SIMULATION_ASSIGNED,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyAdminSimulationAssigned(
    adminId: string,
    educatorId: string,
    educatorName: string,
    classId: string,
    className: string,
    simulationId: string,
    simulationTitle: string,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.ADMIN_SIMULATION_ASSIGNED(
      educatorName,
      className,
      simulationTitle,
    );
    const saved = await this.persist(
      NotificationType.SIMULATION_ASSIGNED,
      NotificationsConstants.TITLES.SIMULATION_ASSIGNED,
      message,
      adminId,
      RecipientType.ADMIN,
      { educatorId, educatorName, classId, className, simulationId, simulationTitle },
    );
    if (saved) {
      this.emitToRecipient(
        RecipientType.ADMIN,
        adminId,
        NotificationsConstants.EVENTS.SIMULATION_ASSIGNED,
        this.buildSocketPayload(saved),
      );
    }
  }

  async notifyEducatorStudentReportAvailable(
    educatorId: string,
    studentName: string,
    simulationTitle: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.STUDENT_REPORT_AVAILABLE(
      studentName,
      simulationTitle,
    );
    const saved = await this.persist(
      NotificationType.STUDENT_REPORT_AVAILABLE,
      NotificationsConstants.TITLES.STUDENT_REPORT_AVAILABLE,
      message,
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

  async notifyAdminStudentReportAvailable(
    adminId: string,
    studentName: string,
    simulationTitle: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const message = NotificationsConstants.MESSAGES.STUDENT_REPORT_AVAILABLE(
      studentName,
      simulationTitle,
    );
    const saved = await this.persist(
      NotificationType.STUDENT_REPORT_AVAILABLE,
      NotificationsConstants.TITLES.STUDENT_REPORT_AVAILABLE,
      message,
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
    const socketId = this.studentSockets.get(studentCode);
    if (socketId) {
      this.server.to(socketId).emit(NotificationsConstants.EVENTS.STUDENT_SIMULATIONS_UPDATED, {
        scenarioId,
        status: 'Assessment completed',
      });
      this.logger.log(
        `[notifyStudentSimulationsUpdated] Emitted to student ${studentCode} for scenario ${scenarioId}`,
      );
    }
  }

  async notifyClassTransferSourceEducator(
    sourceEducatorId: string,
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
      NotificationType.GENERAL,
      NotificationsConstants.TITLES.CLASS_TRANSFERRED_SOURCE,
      message,
      sourceEducatorId,
      RecipientType.EDUCATOR,
      { className, targetEducatorName, transferredAt },
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
      NotificationType.GENERAL,
      NotificationsConstants.TITLES.CLASS_TRANSFERRED_TARGET,
      message,
      targetEducatorId,
      RecipientType.EDUCATOR,
      { className, sourceEducatorName, transferredAt },
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
}
