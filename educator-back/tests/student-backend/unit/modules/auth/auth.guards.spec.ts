import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import type { Reflector } from '@nestjs/core';

const mockReflector = { get: jest.fn() } as unknown as Reflector;

function buildContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(mockReflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
