import { Test, type TestingModule } from '@nestjs/testing';
import { trace } from '@opentelemetry/api';

import {
  TelemetryService,
  TelemetryEventName,
  SessionEndReason,
  CompletionStatus,
} from '../../../../../src/student-backend/modules/telemetry/telemetry.service';

// Mock OpenTelemetry
const mockSpan = {
  setAttribute: jest.fn(),
  addEvent: jest.fn(),
  end: jest.fn(),
};

const mockTracer = {
  startSpan: jest.fn(() => mockSpan),
};

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => mockTracer),
  },
}));

describe('TelemetryService', () => {
  let service: TelemetryService;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TelemetryService],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackLoginSessionStarted', () => {
    it('should emit LoginSessionStarted event with correct properties', () => {
      const properties = {
        loginSessionId: 'session-123',
        studentCode: 'student-456',
        loginTimestamp: '2026-07-24T10:00:00.000Z',
        deviceType: 'desktop',
        platform: 'Windows',
        schemaVersion: '1.0.0',
      };

      service.trackLoginSessionStarted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        `BusinessEvent.${TelemetryEventName.LoginSessionStarted}`,
        { kind: 1 },
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('loginSessionId', 'session-123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('studentCode', 'student-456');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'loginTimestamp',
        '2026-07-24T10:00:00.000Z',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('deviceType', 'desktop');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('platform', 'Windows');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'event.name',
        TelemetryEventName.LoginSessionStarted,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('event.type', 'BusinessEvent');
      expect(mockSpan.addEvent).toHaveBeenCalledWith(
        TelemetryEventName.LoginSessionStarted,
        expect.objectContaining({
          loginSessionId: 'session-123',
          studentCode: 'student-456',
          'event.name': TelemetryEventName.LoginSessionStarted,
        }),
      );
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle optional properties', () => {
      const properties = {
        loginSessionId: 'session-123',
        studentCode: 'student-456',
        loginTimestamp: '2026-07-24T10:00:00.000Z',
        schemaVersion: '1.0.0',
      };

      service.trackLoginSessionStarted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        `BusinessEvent.${TelemetryEventName.LoginSessionStarted}`,
        { kind: 1 },
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('loginSessionId', 'session-123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('studentCode', 'student-456');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'loginTimestamp',
        '2026-07-24T10:00:00.000Z',
      );
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('trackLoginSessionEnded', () => {
    it('should emit LoginSessionEnded event with correct properties', () => {
      const properties = {
        loginSessionId: 'session-123',
        studentCode: 'student-456',
        logoutTimestamp: '2026-07-24T11:00:00.000Z',
        sessionDurationMs: 3600000,
        endReason: SessionEndReason.Logout,
        schemaVersion: '1.0.0',
      };

      service.trackLoginSessionEnded(properties);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        `BusinessEvent.${TelemetryEventName.LoginSessionEnded}`,
        { kind: 1 },
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('loginSessionId', 'session-123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('studentCode', 'student-456');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'logoutTimestamp',
        '2026-07-24T11:00:00.000Z',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('sessionDurationMs', 3600000);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('endReason', 'Logout');
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle Timeout end reason', () => {
      const properties = {
        loginSessionId: 'session-123',
        studentCode: 'student-456',
        logoutTimestamp: '2026-07-24T11:00:00.000Z',
        sessionDurationMs: 3600000,
        endReason: SessionEndReason.Timeout,
        schemaVersion: '1.0.0',
      };

      service.trackLoginSessionEnded(properties);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        `BusinessEvent.${TelemetryEventName.LoginSessionEnded}`,
        { kind: 1 },
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('endReason', 'Timeout');
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('trackScenarioStarted', () => {
    it('should emit ScenarioStarted event with correct properties', () => {
      const properties = {
        scenarioSessionId: 'scenario-session-123',
        loginSessionId: 'session-123',
        transcriptId: 'transcript-123',
        studentCode: 'student-456',
        scenarioId: 'scenario-789',
        scenarioName: 'Emergency Response Simulation',
        scenarioType: 'Practice' as const,
        startTimestamp: '2026-07-24T10:15:00.000Z',
        schemaVersion: '1.0.0',
      };

      service.trackScenarioStarted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        `BusinessEvent.${TelemetryEventName.ScenarioStarted}`,
        { kind: 1 },
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'scenarioSessionId',
        'scenario-session-123',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('loginSessionId', 'session-123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('transcriptId', 'transcript-123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('studentCode', 'student-456');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('scenarioId', 'scenario-789');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'scenarioName',
        'Emergency Response Simulation',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('scenarioType', 'Practice');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'startTimestamp',
        '2026-07-24T10:15:00.000Z',
      );
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle Assessment scenario type', () => {
      const properties = {
        scenarioSessionId: 'scenario-session-123',
        loginSessionId: 'session-123',
        transcriptId: 'transcript-123',
        studentCode: 'student-456',
        scenarioId: 'scenario-789',
        scenarioName: 'Final Assessment',
        scenarioType: 'Assessment' as const,
        startTimestamp: '2026-07-24T10:15:00.000Z',
        schemaVersion: '1.0.0',
      };

      service.trackScenarioStarted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalled();
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('scenarioType', 'Assessment');
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('trackScenarioCompleted', () => {
    it('should emit ScenarioCompleted event with all properties', () => {
      const properties = {
        scenarioSessionId: 'scenario-session-123',
        loginSessionId: 'session-123',
        transcriptId: 'transcript-123',
        studentCode: 'student-456',
        scenarioId: 'scenario-789',
        scenarioName: 'Emergency Response Simulation',
        scenarioType: 'Assessment' as const,
        durationMs: 1800000,
        completionStatus: CompletionStatus.Completed,
        finalScore: 85,
        passingScore: 70,
        passedAssessment: true,
        endTimestamp: '2026-07-24T10:45:00.000Z',
        schemaVersion: '1.0.0',
      };

      service.trackScenarioCompleted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        `BusinessEvent.${TelemetryEventName.ScenarioCompleted}`,
        { kind: 1 },
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'scenarioSessionId',
        'scenario-session-123',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('durationMs', 1800000);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('completionStatus', 'Completed');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('finalScore', 85);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('passingScore', 70);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('passedAssessment', true);
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle Abandoned completion status', () => {
      const properties = {
        scenarioSessionId: 'scenario-session-123',
        loginSessionId: 'session-123',
        transcriptId: 'transcript-123',
        studentCode: 'student-456',
        scenarioId: 'scenario-789',
        scenarioName: 'Emergency Response Simulation',
        scenarioType: 'Practice' as const,
        durationMs: 600000,
        completionStatus: CompletionStatus.Abandoned,
        endTimestamp: '2026-07-24T10:25:00.000Z',
        schemaVersion: '1.0.0',
      };

      service.trackScenarioCompleted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalled();
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('completionStatus', 'Abandoned');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle optional scoring properties', () => {
      const properties = {
        scenarioSessionId: 'scenario-session-123',
        loginSessionId: 'session-123',
        transcriptId: 'transcript-123',
        studentCode: 'student-456',
        scenarioId: 'scenario-789',
        scenarioName: 'Practice Simulation',
        scenarioType: 'Practice' as const,
        durationMs: 1200000,
        completionStatus: CompletionStatus.Completed,
        endTimestamp: '2026-07-24T10:35:00.000Z',
        schemaVersion: '1.0.0',
      };

      service.trackScenarioCompleted(properties);

      expect(mockTracer.startSpan).toHaveBeenCalled();
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith('finalScore', expect.anything());
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith('passingScore', expect.anything());
      expect(mockSpan.addEvent).toHaveBeenCalled();
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith('passedAssessment', expect.anything());
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('calculateDurationMs', () => {
    it('should calculate duration correctly', () => {
      const startTimestamp = '2026-07-24T10:00:00.000Z';
      const endTimestamp = '2026-07-24T11:00:00.000Z';

      const duration = TelemetryService.calculateDurationMs(startTimestamp, endTimestamp);

      expect(duration).toBe(3600000); // 1 hour in milliseconds
    });

    it('should handle same start and end timestamps', () => {
      const timestamp = '2026-07-24T10:00:00.000Z';

      const duration = TelemetryService.calculateDurationMs(timestamp, timestamp);

      expect(duration).toBe(0);
    });

    it('should return 0 for negative durations', () => {
      const startTimestamp = '2026-07-24T11:00:00.000Z';
      const endTimestamp = '2026-07-24T10:00:00.000Z';

      const duration = TelemetryService.calculateDurationMs(startTimestamp, endTimestamp);

      expect(duration).toBe(0);
    });
  });

  describe('generateSessionId', () => {
    it('should generate a valid UUID v4', () => {
      const sessionId = TelemetryService.generateSessionId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(sessionId).toMatch(uuidRegex);
    });

    it('should generate unique session IDs', () => {
      const sessionId1 = TelemetryService.generateSessionId();
      const sessionId2 = TelemetryService.generateSessionId();

      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe('error handling', () => {
    it('should handle trackEvent errors gracefully', () => {
      mockSpan.addEvent.mockImplementation(() => {
        throw new Error('OpenTelemetry error');
      });

      const properties = {
        loginSessionId: 'session-123',
        studentCode: 'student-456',
        loginTimestamp: '2026-07-24T10:00:00.000Z',
        schemaVersion: '1.0.0',
      };

      // Should not throw
      expect(() => service.trackLoginSessionStarted(properties)).not.toThrow();
    });
  });
});
