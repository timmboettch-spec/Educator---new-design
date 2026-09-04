import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminController } from '@/modules/admin/admin.controller';
import { AdminService } from '@/modules/admin/admin.service';
import type { Action } from '@/data/json-data.service';

describe('AdminController UI/Unit Tests', () => {
  let controller: AdminController;

  const mockAdminService = {
    getScenarioById: jest.fn(),
    updateScenario: jest.fn(),
    createCategory: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
    assignUnitToPermission: jest.fn(),
    getAllStudentsWithStats: jest.fn(),
    getAllPermissions: jest.fn(),
    createStudent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createScenarioAction', () => {
    it('should create an action with feedback fields', async () => {
      const scenarioId = 'scenario-1';
      const actionDto: Action = {
        id: 'action-1',
        title: 'Test Action',
        order: 1,
        items: [],
        correct: '',
        resultName: 'Exemplary Feedback',
        resultMediaType: 'text',
        resultContent: 'Great job!',
      };

      const mockScenario = { id: scenarioId, actions: [] };
      mockAdminService.getScenarioById.mockResolvedValue(mockScenario);
      mockAdminService.updateScenario.mockResolvedValue({});

      const result = await controller.createScenarioAction(scenarioId, actionDto);

      expect(mockAdminService.getScenarioById).toHaveBeenCalledWith(scenarioId);
      expect(mockAdminService.updateScenario).toHaveBeenCalledWith(
        scenarioId,
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({
              resultName: 'Exemplary Feedback',
              resultMediaType: 'text',
            }),
          ]),
        }),
      );
      expect(result.resultName).toBe('Exemplary Feedback');
    });
  });

  describe('deleteScenarioAction', () => {
    it('should remove action and clean up linkedActionIds/linkedActions in orders', async () => {
      const scenarioId = 'scenario-1';
      const existingActions: Action[] = [
        { id: 'action-keep', title: 'Keep Me', order: 1, items: [], correct: '' },
        { id: 'action-del', title: 'Delete Me', order: 2, items: [], correct: '' },
      ];
      const existingOrders = [
        {
          id: 'order-1',
          linkedActionIds: ['action-keep', 'action-del'],
          linkedActions: [
            { id: 'action-keep', title: 'Keep Me' },
            { id: 'action-del', title: 'Delete Me' },
          ],
        },
        {
          id: 'order-2',
          linkedActionIds: ['action-del'],
          linkedActions: [{ id: 'action-del', title: 'Delete Me' }],
        },
        {
          id: 'order-3',
          linkedActionIds: [],
          linkedActions: [],
        },
      ];

      mockAdminService.getScenarioById.mockReturnValue({
        id: scenarioId,
        actions: existingActions,
        orders: existingOrders,
      });
      mockAdminService.updateScenario.mockResolvedValue({});

      // Delete index 1 ("action-del")
      const result = await controller.deleteScenarioAction(scenarioId, 1);

      expect(result).toEqual({ message: 'Action deleted successfully' });
      expect(mockAdminService.updateScenario).toHaveBeenCalledWith(
        scenarioId,
        expect.objectContaining({
          actions: [expect.objectContaining({ id: 'action-keep', order: 1 })],
          orders: [
            expect.objectContaining({
              id: 'order-1',
              linkedActionIds: ['action-keep'],
              linkedActions: [{ id: 'action-keep', title: 'Keep Me' }],
            }),
            expect.objectContaining({
              id: 'order-2',
              linkedActionIds: [],
              linkedActions: [],
            }),
            expect.objectContaining({
              id: 'order-3',
              linkedActionIds: [],
              linkedActions: [],
            }),
          ],
        }),
      );
    });

    it('should handle scenario with no orders when deleting an action', async () => {
      const scenarioId = 'scenario-1';
      mockAdminService.getScenarioById.mockReturnValue({
        id: scenarioId,
        actions: [{ id: 'action-1', title: 'Action', order: 1, items: [], correct: '' }],
      });
      mockAdminService.updateScenario.mockResolvedValue({});

      const result = await controller.deleteScenarioAction(scenarioId, 0);

      expect(result).toEqual({ message: 'Action deleted successfully' });
      const updateCall = mockAdminService.updateScenario.mock.calls[0][1];
      expect(updateCall.orders).toEqual([]);
    });
  });

  describe('updateScenarioAction', () => {
    it('should update an action with feedback fields', async () => {
      const scenarioId = 'scenario-1';
      const existingActions: Action[] = [
        {
          id: 'action-1',
          title: 'Old Title',
          order: 1,
          items: [],
          correct: '',
          resultName: 'Old Feedback',
        },
      ];

      const mockScenario = { id: scenarioId, actions: existingActions };
      const updateDto = { resultName: 'New Feedback' };

      mockAdminService.getScenarioById.mockReturnValue(mockScenario);
      mockAdminService.updateScenario.mockResolvedValue({});

      const result = await controller.updateScenarioAction(scenarioId, 0, updateDto);

      expect(result.resultName).toBe('New Feedback');
      expect(mockAdminService.updateScenario).toHaveBeenCalledWith(
        scenarioId,
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({
              resultName: 'New Feedback',
            }),
          ]),
        }),
      );
    });
  });
});
