import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminService } from '@/modules/admin/admin.service';
import { JsonDataService } from '@/data/json-data.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AdminService - Category Management', () => {
  let service: AdminService;

  const mockJsonDataService = {
    getScenarioById: jest.fn(),
    getActionCategories: jest.fn(),
    createActionCategory: jest.fn(),
    updateActionCategory: jest.fn(),
    deleteActionCategory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: JsonDataService,
          useValue: mockJsonDataService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);

    jest.clearAllMocks();
  });

  describe('getScenarioCategories', () => {
    it('should return categories for a valid scenario', async () => {
      const scenarioId = 'scenario-1';
      const mockCategories = [{ id: 'cat-1', name: 'Test Category' }];

      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.getActionCategories.mockReturnValue(mockCategories);

      const result = service.getScenarioCategories(scenarioId);

      expect(result).toEqual(mockCategories);
      expect(mockJsonDataService.getScenarioById).toHaveBeenCalledWith(scenarioId);
      expect(mockJsonDataService.getActionCategories).toHaveBeenCalledWith(scenarioId);
    });

    it('should throw NotFoundException if scenario does not exist', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () => service.getScenarioCategories('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createCategory', () => {
    const scenarioId = 'scenario-1';
    const newCategoryData = {
      name: 'New Cat',
      description: 'Desc',
      color: '#000000',
    };

    it('should create a category successfully', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.createActionCategory.mockReturnValue({
        id: 'new-id',
        ...newCategoryData,
      });

      const result = await service.createCategory(scenarioId, newCategoryData);

      expect(result).toEqual({ id: 'new-id', ...newCategoryData });
      expect(mockJsonDataService.createActionCategory).toHaveBeenCalledWith(
        scenarioId,
        newCategoryData,
      );
    });

    it('should throw BadRequestException if name is empty', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      await expect(async () => service.createCategory(scenarioId, { name: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if scenario does not exist', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () => service.createCategory(scenarioId, newCategoryData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if category already exists', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.createActionCategory.mockImplementation(() => {
        throw new Error('Category already exists');
      });

      await expect(async () => service.createCategory(scenarioId, newCategoryData)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateCategory', () => {
    const scenarioId = 'scenario-1';
    const categoryId = 'cat-1';
    const updates = { name: 'Updated Name' };

    it('should update a category successfully', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.updateActionCategory.mockReturnValue({
        id: categoryId,
        ...updates,
      });

      const result = await service.updateCategory(scenarioId, categoryId, updates);

      expect(result).toEqual({ id: categoryId, ...updates });
      expect(mockJsonDataService.updateActionCategory).toHaveBeenCalledWith(
        scenarioId,
        categoryId,
        updates,
      );
    });

    it('should throw BadRequestException if name is empty string', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      await expect(async () =>
        service.updateCategory(scenarioId, categoryId, { name: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if scenario does not exist', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () =>
        service.updateCategory(scenarioId, categoryId, updates),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if update fails with "already exists"', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.updateActionCategory.mockImplementation(() => {
        throw new Error('Category already exists');
      });

      await expect(async () =>
        service.updateCategory(scenarioId, categoryId, updates),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if category not found', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.updateActionCategory.mockImplementation(() => {
        throw new Error('Category not found');
      });

      await expect(async () =>
        service.updateCategory(scenarioId, categoryId, updates),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCategory', () => {
    const scenarioId = 'scenario-1';
    const categoryId = 'cat-1';

    it('should delete a category successfully', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });

      const result = await service.deleteCategory(scenarioId, categoryId);

      expect(result).toEqual({
        message: 'Category deleted successfully. Actions reassigned to Uncategorized.',
      });
      expect(mockJsonDataService.deleteActionCategory).toHaveBeenCalledWith(scenarioId, categoryId);
    });

    it('should throw NotFoundException if scenario does not exist', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () => service.deleteCategory(scenarioId, categoryId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if category does not exist', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.deleteActionCategory.mockImplementation(() => {
        throw new Error('Category not found');
      });

      await expect(async () => service.deleteCategory(scenarioId, categoryId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if cannot delete (e.g. system category)', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: scenarioId });
      mockJsonDataService.deleteActionCategory.mockImplementation(() => {
        throw new Error('Cannot delete system category');
      });

      await expect(async () => service.deleteCategory(scenarioId, categoryId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
