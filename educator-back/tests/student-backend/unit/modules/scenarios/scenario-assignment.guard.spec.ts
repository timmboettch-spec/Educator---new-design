import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { ScenarioAssignmentGuard } from '@/modules/scenarios/guards/scenario-assignment.guard';
import { type ScenarioAssignmentService } from '@/modules/scenarios/scenario-assignment.service';

interface FakeRequest {
  user?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, string | undefined>;
}

function ctxFor(req: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}) as never,
      getNext: () => ({}) as never,
    }),
  } as unknown as ExecutionContext;
}

describe('ScenarioAssignmentGuard', () => {
  let assignmentService: jest.Mocked<ScenarioAssignmentService>;
  let guard: ScenarioAssignmentGuard;

  beforeEach(() => {
    assignmentService = {
      isScenarioAssigned: jest.fn(),
      getAssignedSimulationIds: jest.fn(),
    } as unknown as jest.Mocked<ScenarioAssignmentService>;
    guard = new ScenarioAssignmentGuard(assignmentService);
  });

  it('throws UnauthorizedException when req.user is missing', async () => {
    await expect(guard.canActivate(ctxFor({ params: { id: 'sim-1' } }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(assignmentService.isScenarioAssigned).not.toHaveBeenCalled();
  });

  it('allows admin/local JWT principals through without calling the Educator API', async () => {
    const req: FakeRequest = {
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: 'sim-1' },
      headers: { authorization: 'Bearer local-admin-token' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(assignmentService.isScenarioAssigned).not.toHaveBeenCalled();
  });

  it('allows through when no scenarioId is present (list endpoints)', async () => {
    const req: FakeRequest = {
      user: { type: 'student', sub: 's1' },
      params: {},
      headers: { authorization: 'Bearer stu-tok' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(assignmentService.isScenarioAssigned).not.toHaveBeenCalled();
  });

  it('allows students whose requested scenario is in the Educator assignment set', async () => {
    assignmentService.isScenarioAssigned.mockResolvedValue(true);
    const req: FakeRequest = {
      user: { type: 'student', sub: 's1' },
      params: { id: 'sim-allowed' },
      headers: { authorization: 'Bearer stu-tok' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(assignmentService.isScenarioAssigned).toHaveBeenCalledWith(
      's1',
      'sim-allowed',
      'stu-tok',
    );
  });

  it('rejects with 403 when the Educator API says the scenario is not assigned', async () => {
    assignmentService.isScenarioAssigned.mockResolvedValue(false);
    const req: FakeRequest = {
      user: { type: 'student', sub: 's1' },
      params: { id: 'sim-not-assigned' },
      headers: { authorization: 'Bearer stu-tok' },
    };

    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads scenarioId from `scenarioId` route param when `id` is absent', async () => {
    assignmentService.isScenarioAssigned.mockResolvedValue(true);
    const req: FakeRequest = {
      user: { type: 'student', sub: 's1' },
      params: { scenarioId: 'sim-from-scenarioId' },
      headers: { authorization: 'Bearer stu-tok' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(assignmentService.isScenarioAssigned).toHaveBeenCalledWith(
      's1',
      'sim-from-scenarioId',
      'stu-tok',
    );
  });

  it('rejects the student when the JWT is missing sub / studentId', async () => {
    const req: FakeRequest = {
      user: { type: 'student' },
      params: { id: 'sim-1' },
      headers: { authorization: 'Bearer stu-tok' },
    };

    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(assignmentService.isScenarioAssigned).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when no Bearer token is present on the request', async () => {
    const req: FakeRequest = {
      user: { type: 'student', sub: 's1' },
      params: { id: 'sim-1' },
      headers: {},
    };

    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(assignmentService.isScenarioAssigned).not.toHaveBeenCalled();
  });

  it('propagates 403 raised by the assignment service (upstream 401/403)', async () => {
    assignmentService.isScenarioAssigned.mockRejectedValue(new ForbiddenException());
    const req: FakeRequest = {
      user: { type: 'student', sub: 's1' },
      params: { id: 'sim-1' },
      headers: { authorization: 'Bearer stu-tok' },
    };

    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
