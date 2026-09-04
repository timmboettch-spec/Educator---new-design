import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ModuleMetadata } from '@nestjs/common/interfaces';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { EducatorSessionService } from 'src/session/educator-session.service';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { AzureBlobService } from 'src/config/azure-blob.config';

export const TEST_JWT_SECRET = 'test-integration-secret-key';

export interface TestUser {
  sub: string;
  email: string;
  roles: string[];
  type: string;
}

export const TEST_USERS = {
  districtAdmin: {
    sub: '550e8400-e29b-41d4-a716-446655440001',
    email: 'admin@test.com',
    roles: ['District Admin'],
    type: 'admin',
  },
  superAdmin: {
    sub: '550e8400-e29b-41d4-a716-446655440002',
    email: 'super@test.com',
    roles: ['Super Admin'],
    type: 'admin',
  },
  educator: {
    sub: '550e8400-e29b-41d4-a716-446655440003',
    email: 'educator@test.com',
    roles: ['Educator'],
    type: 'educator',
  },
} satisfies Record<string, TestUser>;

export const jwtProviders = [
  JwtStrategy,
  TokenBlacklistService,
  {
    provide: AzureBlobService,
    useValue: { uploadFile: jest.fn(), generateSasUrl: jest.fn().mockResolvedValue('') },
  },
  {
    provide: EducatorSessionService,
    useValue: {
      isTokenInvalidated: jest.fn().mockResolvedValue(false),
    },
  },
  {
    provide: ClsService,
    useValue: {
      set: jest.fn(),
      get: jest.fn(),
    },
  },
  {
    provide: ConfigService,
    useValue: {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
        if (key === 'JWT_EXPIRES_IN') return '1h';
        if (key === 'FRONTEND_URL') return 'http://localhost:5173';
        return null;
      }),
    },
  },
];

export const jwtImports = [
  PassportModule.register({ defaultStrategy: 'jwt' }),
  JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
];

export async function buildTestApp(meta: ModuleMetadata): Promise<{
  app: INestApplication;
  module: TestingModule;
  signToken: (user?: Partial<TestUser>) => string;
}> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [...jwtImports, ...(meta.imports ?? [])],
    controllers: meta.controllers ?? [],
    providers: [...jwtProviders, ...(meta.providers ?? [])],
  }).compile();

  const app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const jwtService = module.get(JwtService);

  function signToken(user: Partial<TestUser> = TEST_USERS.districtAdmin): string {
    const payload = { ...TEST_USERS.districtAdmin, ...user };
    return jwtService.sign({ sub: payload.sub, email: payload.email, roles: payload.roles, type: payload.type });
  }

  return { app, module, signToken };
}
