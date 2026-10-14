export const NotificationsConstants = {
  ROUTES: {
    BASE: 'notifications',
    UNREAD_COUNT: 'unread-count',
    MARK_READ: ':id/read',
    MARK_UNREAD: ':id/unread',
    MARK_ALL_READ: 'read-all',
    MARK_ALL_UNREAD: 'unread-all',
    BY_ID: ':id',
    PREFERENCES: 'preferences',
  },
  EVENTS: {
    EDUCATOR_REGISTERED: 'educator-registered',
    EDUCATOR_STATUS_UPDATED: 'educator-status-updated',
    CLASS_CREATED: 'class-created',
    CLASS_TRANSFERRED: 'class-transferred',
    CLASS_TRANSFERRED_SOURCE: 'class-transferred-source',
    CLASS_TRANSFERRED_TARGET: 'class-transferred-target',
    CLASSES_TRANSFERRED_SOURCE: 'classes-transferred-source',
    CLASSES_TRANSFERRED_TARGET: 'classes-transferred-target',
    CLASS_START_DATE_REMINDER: 'class-start-date-reminder',
    CLASS_END_DATE_REMINDER: 'class-end-date-reminder',
    EDUCATOR_LOW_SEAT_WARNING: 'educator-low-seat-warning',
    SCHOOL_LOW_SEAT_WARNING: 'school-low-seat-warning',
    EDUCATOR_SEAT_REQUEST: 'educator-seat-request',
    STUDENT_REPORT_AVAILABLE: 'student-report-available',
    LMS_GRADE_SYNC_FAILED: 'lms-grade-sync-failed',
    SIMULATION_START_DATE_REMINDER: 'simulation-start-date-reminder',
    SIMULATION_DUE_DATE_REMINDER: 'simulation-due-date-reminder',
    SIMULATION_END_DATE_REMINDER: 'simulation-end-date-reminder',
    STUDENT_SIMULATIONS_UPDATED: 'simulations-updated',
    EDUCATOR_SCHOOL_REMOVED: 'educator-school-removed',
    EDUCATOR_SCHOOL_ADDED: 'educator-school-added',
    SCHOOL_STATUS_CHANGED: 'school-status-changed',
    TOKENS_ALLOCATED: 'tokens-allocated',
  },
  ROOMS: {
    EDUCATOR: (educatorId: string): string => `educator:${educatorId}`,
    ADMIN: (adminId: string): string => `admin:${adminId}`,
    STUDENT: (studentCode: string): string => `student:${studentCode}`,
  },
  TITLES: {
    EDUCATOR_REGISTERED: 'Educator Invitation Accepted',
    EDUCATOR_STATUS_UPDATED: 'Educator Status Updated',
    CLASS_CREATED: 'Class Created',
    CLASS_TRANSFERRED: 'Class Transferred',
    CLASS_TRANSFERRED_SOURCE: 'Class Transferred',
    CLASS_TRANSFERRED_TARGET: 'New Class Assigned',
    CLASSES_TRANSFERRED_SOURCE: 'Classes Transferred',
    CLASSES_TRANSFERRED_TARGET: 'New Classes Assigned',
    CLASS_START_DATE_REMINDER: 'Class Starting Soon',
    CLASS_END_DATE_REMINDER: 'Class Ending Soon',
    EDUCATOR_LOW_SEAT_WARNING: 'Educator Low Seat Warning',
    SCHOOL_LOW_SEAT_WARNING: 'School Low Seat Warning',
    EDUCATOR_SEAT_REQUEST: 'Educator Requested More Seats',
    STUDENT_REPORT_AVAILABLE: 'Student Reports Available',
    LMS_GRADE_SYNC_FAILED: 'LMS Grade Sync Failed',
    SIMULATION_START_DATE_REMINDER: 'Simulation Starting Soon',
    SIMULATION_DUE_DATE_REMINDER: 'Simulation Due Date Reminder',
    SIMULATION_END_DATE_REMINDER: 'Simulation Closing Soon',
    TOKENS_ALLOCATED: 'AI Seats Allocated',
    SCHOOL_STATUS_CHANGED: 'School Status Updated',
    EDUCATOR_SCHOOL_REMOVED: 'School Access Removed',
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
    STUDENT_REPORT_AVAILABLE_COUNT: (count: number): string =>
      count === 1 ? '1 student report is available.' : `${count} student reports are available.`,
    LMS_GRADE_SYNC_FAILED: (count: number, className: string, studentName: string): string =>
      count === 1
        ? `Grade sync failed for ${studentName} — ${className}.`
        : `${count} grade sync failures in ${className}.`,
    SIMULATION_DUE_DATE_REMINDER: (
      simulationTitle: string,
      className: string,
      dueDate: string,
    ): string => `Simulation "${simulationTitle}" for class "${className}" is due on ${dueDate}.`,
    SIMULATION_START_DATE_REMINDER: (
      simulationTitle: string,
      className: string,
      startDate: string,
    ): string => `Simulation "${simulationTitle}" for class "${className}" starts on ${startDate}.`,
    SIMULATION_END_DATE_REMINDER: (
      simulationTitle: string,
      className: string,
      endDate: string,
    ): string => `Simulation "${simulationTitle}" for class "${className}" closes on ${endDate}.`,
    CLASS_START_DATE_REMINDER: (className: string, startDate: string): string =>
      `Class "${className}" is starting on ${startDate}.`,
    CLASS_END_DATE_REMINDER: (className: string, endDate: string): string =>
      `Class "${className}" is ending on ${endDate}.`,
    TOKENS_ALLOCATED: (seats: number): string =>
      `${seats} AI seat${seats === 1 ? '' : 's'} have been allocated to your account.`,
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
    CLASSES_TRANSFERRED_SOURCE: (count: number, targetEducatorName: string): string =>
      count === 1
        ? `1 of your classes has been transferred to ${targetEducatorName}.`
        : `${count} of your classes have been transferred to ${targetEducatorName}.`,
    CLASSES_TRANSFERRED_TARGET: (count: number, sourceEducatorName: string): string =>
      count === 1
        ? `1 class has been assigned to you from ${sourceEducatorName}.`
        : `${count} classes have been assigned to you from ${sourceEducatorName}.`,
    SCHOOL_STATUS_CHANGED: (schoolName: string, isActive: boolean): string =>
      isActive
        ? `Your school "${schoolName}" has been reactivated.`
        : `Your school "${schoolName}" has been deactivated.`,
    EDUCATOR_SCHOOL_REMOVED: (schoolName: string): string =>
      `You have been removed from "${schoolName}".`,
  },
  ERRORS: {
    NOT_FOUND: 'Notification not found',
  },
  DEFAULTS: {
    LOW_EDUCATOR_SEAT_THRESHOLD: 10,
    LOW_SCHOOL_SEAT_THRESHOLD: 10,
    DUE_DATE_REMINDER_DAYS: 3,
    DATE_REMINDER_DAYS: 3,
    EDUCATOR_SEAT_REQUEST_COOLDOWN_MINUTES: 1440, // minutes
  },
} as const;
