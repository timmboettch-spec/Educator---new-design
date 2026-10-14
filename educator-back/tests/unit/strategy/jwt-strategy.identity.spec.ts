import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../src/auth/auth.service';
import { JwtPayload } from '../../../src/common/interfaces';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { RoleSlug, TokenPurposeType, UserTokenType } from '../../../src/common/constants';

/**
 * Account roles and identity resolved by `AuthService.validateUserToken()` per token type, plus
 * the blacklist rejection surfaced by `TokenService.verifyToken` (RWAI-3087 ticket 01).
 */
describe('AuthService.validateUserToken — attached identity and blacklist', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const TOKEN = 'header.payload.signature';

  const userRepo = { findOne: jest.fn() };
  const userRoleRepo = { findByUserId: jest.fn() };
  const studentRepo = { findOne: jest.fn() };
  const tokenService = { verifyToken: jest.fn() };
  let service: AuthService;

  const activeRole = (slug: RoleSlug, extra: Record<string, unknown> = {}) => ({
    status: CommonStatus.ACTIVE,
    role: { slug },
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.findOne.mockResolvedValue({ id: USER_ID, email: 'user@test.com' });
    service = Object.assign(Object.create(AuthService.prototype) as AuthService, {
      tokenService,
      userRepo,
      userRoleRepo,
      studentRepo,
    });
  });

  const accessPayload = (type: UserTokenType): JwtPayload => ({
    sub: USER_ID,
    email: 'user@test.com',
    purpose: TokenPurposeType.ACCESS,
    type,
  });

  it('attaches educator identity and account roles unchanged', async () => {
    tokenService.verifyToken.mockResolvedValue(accessPayload(UserTokenType.EDUCATOR));
    userRoleRepo.findByUserId.mockResolvedValue([
      activeRole(RoleSlug.EDUCATOR, { educator: { id: 'edu-1' } }),
    ]);

    await expect(service.validateUserToken(TOKEN)).resolves.toEqual({
      userId: USER_ID,
      email: 'user@test.com',
      roles: [RoleSlug.EDUCATOR],
      purpose: TokenPurposeType.ACCESS,
      type: UserTokenType.EDUCATOR,
      educatorId: 'edu-1',
    });
  });

  it('attaches district admin identity and account roles unchanged', async () => {
    tokenService.verifyToken.mockResolvedValue(accessPayload(UserTokenType.ADMIN));
    userRoleRepo.findByUserId.mockResolvedValue([
      activeRole(RoleSlug.DISTRICT_ADMIN, { districtAdmin: { districtAdminId: 'da-1' } }),
      activeRole(RoleSlug.EDUCATOR, { educator: { id: 'edu-1' } }),
    ]);

    await expect(service.validateUserToken(TOKEN)).resolves.toEqual({
      userId: USER_ID,
      email: 'user@test.com',
      roles: [RoleSlug.DISTRICT_ADMIN, RoleSlug.EDUCATOR],
      purpose: TokenPurposeType.ACCESS,
      type: UserTokenType.ADMIN,
      adminId: 'da-1',
    });
  });

  it('attaches scenario admin identity and account roles unchanged', async () => {
    tokenService.verifyToken.mockResolvedValue(accessPayload(UserTokenType.SCENARIO_ADMIN));
    userRoleRepo.findByUserId.mockResolvedValue([activeRole(RoleSlug.SCENARIO_ADMIN)]);

    await expect(service.validateUserToken(TOKEN)).resolves.toEqual({
      userId: USER_ID,
      email: 'user@test.com',
      roles: [RoleSlug.SCENARIO_ADMIN],
      purpose: TokenPurposeType.ACCESS,
      type: UserTokenType.SCENARIO_ADMIN,
    });
  });

  it("sets account roles to ['student'] for a student token, ignoring any roles claim", async () => {
    tokenService.verifyToken.mockResolvedValue({
      sub: 'STU-001',
      user_id: 'stu-uuid-1',
      student_id: 'STU-001',
      type: UserTokenType.STUDENT,
      roles: [RoleSlug.EDUCATOR],
    } as JwtPayload);
    studentRepo.findOne.mockResolvedValue({
      id: 'stu-uuid-1',
      student_id: 'STU-001',
      is_active: true,
      deleted_at: null,
      status: CommonStatus.ACTIVE,
      class: { is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
      educator: { is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
    });

    const result = await service.validateUserToken(TOKEN);

    expect(result.roles).toEqual([RoleSlug.STUDENT]);
    expect(result.type).toBe(UserTokenType.STUDENT);
    expect(result.studentId).toBe('stu-uuid-1');
    expect(result.student_id).toBe('STU-001');
  });

  it('rejects a blacklisted token with 401 before any account lookup', async () => {
    tokenService.verifyToken.mockRejectedValue(new UnauthorizedException());

    await expect(service.validateUserToken(TOKEN)).rejects.toThrow(UnauthorizedException);
    expect(tokenService.verifyToken).toHaveBeenCalledWith(TOKEN);
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(studentRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a blacklisted student token with 401', async () => {
    tokenService.verifyToken.mockRejectedValue(new UnauthorizedException());

    await expect(service.validateUserToken(TOKEN)).rejects.toThrow(UnauthorizedException);
    expect(studentRepo.findOne).not.toHaveBeenCalled();
  });
});
