export const createAuthServiceMock = () => ({
  validateUser: jest.fn(),
  login: jest.fn().mockResolvedValue({ access_token: 'mock.jwt.token' }),
  logout: jest.fn().mockResolvedValue(undefined),
});

export const createJwtServiceMock = () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn().mockReturnValue({ userId: 'mock-user-id', username: 'testuser' }),
});

export const AUTH_GUARD_MOCK = {
  canActivate: jest.fn().mockReturnValue(true),
};
