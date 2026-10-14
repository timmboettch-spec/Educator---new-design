import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../src/auth/auth.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { UserTokenType } from '../../../src/common/constants';

describe('AuthService.validateUserToken Student Status Validation', () => {
  let service: AuthService;

  const mockUserRepo = {
    findOne: jest.fn(),
  } as any;

  const mockUserRoleRepo = {
    findByUserId: jest.fn().mockResolvedValue([]),
  } as any;

  const mockStudentRepo = {
    findOne: jest.fn(),
  } as any;

  const mockTokenService = { verifyToken: jest.fn() } as any;

  const validStudentPayload = {
    sub: 'STUDENT_001',
    user_id: 'stu-uuid-123',
    type: UserTokenType.STUDENT,
    student_id: 'STUDENT_001',
    roles: ['Student'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRoleRepo.findByUserId.mockResolvedValue([]);

    service = Object.assign(Object.create(AuthService.prototype) as AuthService, {
      tokenService: mockTokenService,
      userRepo: mockUserRepo,
      userRoleRepo: mockUserRoleRepo,
      studentRepo: mockStudentRepo,
    });
    mockTokenService.verifyToken.mockResolvedValue(validStudentPayload);
  });

  describe('validateUserToken (payload.type === "student")', () => {
    it('should validate and return student user if student, class, and educator are active', async () => {
      mockStudentRepo.findOne.mockResolvedValue({
        id: 'stu-uuid-123',
        student_id: 'STUDENT_001',
        is_active: true,
        deleted_at: null,
        status: CommonStatus.ACTIVE,
        class: { id: 'cls-1', is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
        educator: { id: 'edu-1', is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
      });

      const result = await service.validateUserToken('token');
      expect(result).toBeDefined();
      expect(result.userId).toBe('STUDENT_001');
      expect(result.type).toBe('student');
    });

    it('should throw UnauthorizedException if student is not found', async () => {
      mockStudentRepo.findOne.mockResolvedValue(null);

      await expect(service.validateUserToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if student is_active is false or deleted', async () => {
      mockStudentRepo.findOne.mockResolvedValue({
        id: 'stu-uuid-123',
        student_id: 'STUDENT_001',
        is_active: false,
        deleted_at: new Date(),
        status: CommonStatus.INACTIVE,
      });

      await expect(service.validateUserToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if student educator is deactivated or deleted', async () => {
      mockStudentRepo.findOne.mockResolvedValue({
        id: 'stu-uuid-123',
        student_id: 'STUDENT_001',
        is_active: true,
        deleted_at: null,
        status: CommonStatus.ACTIVE,
        class: { id: 'cls-1', is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
        educator: { id: 'edu-1', is_active: false, deleted_at: new Date(), status: CommonStatus.INACTIVE },
      });

      await expect(service.validateUserToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if student class is inactive', async () => {
      mockStudentRepo.findOne.mockResolvedValue({
        id: 'stu-uuid-123',
        student_id: 'STUDENT_001',
        is_active: true,
        deleted_at: null,
        status: CommonStatus.ACTIVE,
        class: { id: 'cls-1', is_active: false, deleted_at: new Date(), status: CommonStatus.INACTIVE },
        educator: { id: 'edu-1', is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
      });

      await expect(service.validateUserToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
