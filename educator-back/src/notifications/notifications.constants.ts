export const NotificationsConstants = {
  ROUTES: {
    BASE: 'notifications',
    UNREAD_COUNT: 'unread-count',
    MARK_READ: ':id/read',
    MARK_UNREAD: ':id/unread',
    MARK_ALL_READ: 'read-all',
    MARK_ALL_UNREAD: 'unread-all',
    BY_ID: ':id',
  },
  EVENTS: {
    EDUCATOR_REGISTERED: 'educator-registered',
    EDUCATOR_STATUS_UPDATED: 'educator-status-updated',
    CLASS_CREATED: 'class-created',
    CLASS_TRANSFERRED_SOURCE: 'class-transferred-source',
    CLASS_TRANSFERRED_TARGET: 'class-transferred-target',
    SIMULATION_ASSIGNED: 'simulation-assigned',
    EDUCATOR_LOW_SEAT_WARNING: 'educator-low-seat-warning',
    SCHOOL_LOW_SEAT_WARNING: 'school-low-seat-warning',
    EDUCATOR_SEAT_REQUEST: 'educator-seat-request',
    STUDENT_REPORT_AVAILABLE: 'student-report-available',
    SIMULATION_DUE_DATE_REMINDER: 'simulation-due-date-reminder',
    STUDENT_SIMULATIONS_UPDATED: 'simulations-updated',
    EDUCATOR_SCHOOL_REMOVED: 'educator-school-removed',
    EDUCATOR_SCHOOL_ADDED: 'educator-school-added',
    SCHOOL_STATUS_CHANGED: 'school-status-changed',
  },
  TITLES: {
    EDUCATOR_REGISTERED: 'Educator Invitation Accepted',
    EDUCATOR_STATUS_UPDATED: 'Educator Status Updated',
    CLASS_CREATED: 'Class Created',
    CLASS_TRANSFERRED_SOURCE: 'Class Transferred',
    CLASS_TRANSFERRED_TARGET: 'New Class Assigned',
    SIMULATION_ASSIGNED: 'Simulation Assigned',
    EDUCATOR_LOW_SEAT_WARNING: 'Educator Low Seat Warning',
    SCHOOL_LOW_SEAT_WARNING: 'School Low Seat Warning',
    EDUCATOR_SEAT_REQUEST: 'Educator Requested More Seats',
    STUDENT_REPORT_AVAILABLE: 'Student Report Available',
    SIMULATION_DUE_DATE_REMINDER: 'Simulation Due Date Reminder',
  },
  MESSAGES: {
    EDUCATOR_INVITATION_ACCEPTED: (educatorName: string, completedAtIso: string): string =>
      `${educatorName} completed registration on ${new Date(completedAtIso).toLocaleString()}.`,

    EDUCATOR_STATUS_UPDATED: (educatorName: string, status: string): string =>
      `${educatorName}'s account status has been updated to ${status.toLowerCase()}.`,

    ADMIN_CLASS_CREATED: (className: string, educatorName: string): string =>
      `Educator ${educatorName} created class "${className}".`,
    ADMIN_SIMULATION_ASSIGNED: (
      educatorName: string,
      className: string,
      simulationTitle: string,
    ): string =>
      `Educator ${educatorName} assigned simulation "${simulationTitle}" to class "${className}".`,
    SIMULATION_ASSIGNED: (className: string, simulationTitle: string): string =>
      `Simulation "${simulationTitle}" has been assigned to class "${className}".`,
    EDUCATOR_LOW_SEAT_WARNING: (educatorName: string, remainingSeats: number): string =>
      `${educatorName} has only ${remainingSeats} seats remaining.`,
    SCHOOL_LOW_SEAT_WARNING: (schoolName: string, remainingSchoolSeats: number): string =>
      `${schoolName} has only ${remainingSchoolSeats} seats remaining.`,
    EDUCATOR_SEAT_REQUEST: (
      educatorName: string,
      requestedSeats: number | null,
      remainingSeats: number,
    ): string => {
      const seatsCopy =
        requestedSeats && requestedSeats > 0
          ? `${requestedSeats} additional AI seat${requestedSeats === 1 ? '' : 's'}`
          : 'more AI seats';
      return `${educatorName} is requesting ${seatsCopy} (currently has ${remainingSeats} remaining).`;
    },
    STUDENT_REPORT_AVAILABLE: (studentName: string, simulationTitle: string): string =>
      `Report is available for ${studentName} in simulation "${simulationTitle}".`,
    SIMULATION_DUE_DATE_REMINDER: (
      simulationTitle: string,
      className: string,
      dueDate: string,
    ): string => `Simulation "${simulationTitle}" for class "${className}" is due on ${dueDate}.`,
    CLASS_TRANSFERRED_SOURCE: (
      className: string,
      targetEducatorName: string,
      transferredAt: string,
    ): string =>
      `Your class "${className}" has been transferred to ${targetEducatorName} on ${new Date(transferredAt).toLocaleString()}.`,
    CLASS_TRANSFERRED_TARGET: (
      className: string,
      sourceEducatorName: string,
      transferredAt: string,
    ): string =>
      `Class "${className}" has been assigned to you from ${sourceEducatorName} on ${new Date(transferredAt).toLocaleString()}.`,
  },
  ERRORS: {
    NOT_FOUND: 'Notification not found',
  },
  DEFAULTS: {
    LOW_EDUCATOR_SEAT_THRESHOLD: 10,
    LOW_SCHOOL_SEAT_THRESHOLD: 10,
    DUE_DATE_REMINDER_DAYS: 3,
    EDUCATOR_SEAT_REQUEST_COOLDOWN_HOURS: 24,
  },
} as const;
