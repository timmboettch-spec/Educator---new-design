import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';

let app: INestApplication;

export async function bootstrapTestApp(): Promise<INestApplication> {
  if (app) {
    return app;
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function teardownTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null as unknown as INestApplication;
  }
}
