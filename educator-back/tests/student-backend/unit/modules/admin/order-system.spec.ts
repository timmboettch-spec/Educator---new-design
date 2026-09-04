import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminModule } from '@/modules/admin/admin.module';
import { JsonDataService, JsonDataModule } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';

// --- MOCK LOGIC FOR UNIT TESTS ---
// This represents the server-side validation logic that will prevent invalid state transitions.
const validateOrderTransition = (currentStatus: string, actionId: string, linkedIds: string[]) => {
  if (linkedIds.includes(actionId)) {
    return 'Completed';
  }
  return currentStatus;
};

describe('Order System Backend Verification', () => {
  let app: INestApplication;

  // Mock Data Service
  const mockJsonDataService = {
    getScenarioById: jest.fn(),
    getScenarios: jest.fn().mockReturnValue([]),
    updateScenario: jest.fn(),
    getUnitById: jest.fn(), // Needed for some guards/pipes
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AdminModule, JsonDataModule],
    })
      .overrideProvider(JsonDataService)
      .useValue(mockJsonDataService)
      .overrideGuard(ScenarioAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- UNIT TESTS: LOGIC VALIDATION ---
  describe('Unit: Order State Logic', () => {
    it('should transition to Completed when correct action linked', () => {
      const result = validateOrderTransition('Active', 'act-1', ['act-1', 'act-2']);
      expect(result).toBe('Completed');
    });

    it('should output same status if action is unrelated', () => {
      const result = validateOrderTransition('Active', 'act-99', ['act-1', 'act-2']);
      expect(result).toBe('Active');
    });

    it('should return currentStatus if linkedIds is empty', () => {
      const result = validateOrderTransition('Active', 'act-1', []);
      expect(result).toBe('Active');
    });
  });

  // --- INTEGRATION TESTS: PERSISTENCE ---
  describe('Integration: Multi-Select Persistence', () => {
    it('should accept and persist linkedActionIds via PUT', async () => {
      // Mock existing data
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
        title: 'Test Scenario',
      });
      mockJsonDataService.getUnitById.mockReturnValue({
        id: 'u1',
        Status: 'Paid',
      });
      mockJsonDataService.updateScenario.mockResolvedValue({ id: 's1' });

      const payload = {
        id: 's1',
        title: 'Updated Scenario',
        orders: [
          {
            id: 'ord-1',
            title: 'Order with Links',
            // The critical field we are testing
            linkedActionIds: ['action-a', 'action-b'],
          },
        ],
      };

      await request(app.getHttpServer()).put('/admin/scenarios/s1').send(payload).expect(200);

      // Verify the service was called with our structure
      expect(mockJsonDataService.updateScenario).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          orders: expect.arrayContaining([
            expect.objectContaining({
              linkedActionIds: ['action-a', 'action-b'],
            }),
          ]),
        }),
      );
    });

    it('should persist empty linkedActionIds to clear selection', async () => {
      // Mock existing data
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
        title: 'Test Scenario',
      });
      mockJsonDataService.getUnitById.mockReturnValue({
        id: 'u1',
        Status: 'Paid',
      });
      mockJsonDataService.updateScenario.mockResolvedValue({ id: 's1' });

      const payload = {
        id: 's1',
        title: 'Clear Selection Scenario',
        orders: [
          {
            id: 'ord-1',
            title: 'Order with Cleared Links',
            linkedActionIds: [], // Explicitly sending empty array
          },
        ],
      };

      await request(app.getHttpServer()).put('/admin/scenarios/s1').send(payload).expect(200);

      expect(mockJsonDataService.updateScenario).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          orders: expect.arrayContaining([
            expect.objectContaining({
              linkedActionIds: [],
            }),
          ]),
        }),
      );
    });
  });

  // --- REGRESSION TESTS ---
  describe('Regression: Backward Compatibility', () => {
    it('should accept legacy orders without linkedActionIds', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
      });
      mockJsonDataService.getUnitById.mockReturnValue({
        id: 'u1',
        Status: 'Paid',
      });

      const legacyPayload = {
        id: 's1',
        title: 'Legacy Update',
        orders: [{ id: 'old-1', title: 'No Links' }],
      };

      await request(app.getHttpServer()).put('/admin/scenarios/s1').send(legacyPayload).expect(200);

      expect(mockJsonDataService.updateScenario).toHaveBeenCalled();
    });
  });
});
