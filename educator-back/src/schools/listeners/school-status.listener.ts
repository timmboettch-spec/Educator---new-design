import { Injectable } from '@nestjs/common';
import { SchoolStatusChangedEvent } from '../../common/events/school-status-changed.event';
import { EducatorSessionService } from '../../session/educator-session.service';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { CommonStatus } from '../../common/enums/status.enum';
import { LoggerService } from '../../common/services';

@Injectable()
export class SchoolStatusListener {
  constructor(
    private readonly educatorSessionService: EducatorSessionService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly logger: LoggerService,
  ) {}

  async handleSchoolStatusChanged(event: SchoolStatusChangedEvent): Promise<void> {
    if (event.newStatus !== CommonStatus.INACTIVE) {
      return;
    }

    this.logger.log(
      `[SchoolStatusListener] School "${event.schoolName}" (${event.schoolId}) deactivated — invalidating educator sessions`,
    );

    const affectedIds = await this.educatorSessionService.invalidateBySchool(event.schoolId);

    this.logger.log(
      `[SchoolStatusListener] Notifying ${affectedIds.length} educator(s) via WebSocket`,
    );

    for (const educatorId of affectedIds) {
      this.notificationsGateway.notifyEducatorSchoolDeactivated(educatorId, event.schoolName);
    }
  }
}
