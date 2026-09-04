import {
  Body,
  Controller,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Param,
  Post,
  Query,
  RequestMethod,
  Response,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server as HttpServer } from 'http';
import type { NextFunction, Request } from 'express';
import request from 'supertest';
import { XssMiddleware } from './xss.middleware';

@Controller('xss-test')
class XssTestController {
  @Post(':id')
  echo(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Param('id') id: string,
    @Response() res: { status: (code: number) => { json: (payload: unknown) => void } },
  ): void {
    res.status(201).json({ body, query, id });
  }
}

@Module({
  controllers: [XssTestController],
})
class XssTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(XssMiddleware).forRoutes({
      path: 'xss-test/:id',
      method: RequestMethod.POST,
    });
  }
}

describe('XssMiddleware', () => {
  let middleware: XssMiddleware;

  beforeEach(() => {
    middleware = new XssMiddleware();
  });

  describe('xss middleware (unit)', () => {
    it('allows safe body strings without mutation', () => {
      const req = {
        body: { school_name: 'Green Valley School', nested: { section: 'A' } },
      } as Request;
      const next = jest.fn() as NextFunction;

      middleware.use(req, {} as never, next);

      expect(req.body).toEqual({
        school_name: 'Green Valley School',
        nested: { section: 'A' },
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('sanitizes malicious payload and proceeds to next middleware', () => {
      const req = {
        body: { school_name: '<script>alert(1)</script>' },
      } as Request;
      const next = jest.fn() as NextFunction;

      middleware.use(req, {} as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect((req.body as { school_name: string }).school_name).not.toContain('<script>');
      expect((req.body as { school_name: string }).school_name).not.toContain('alert(1)');
    });
  });

  describe('xss middleware (regression)', () => {
    it('sanitizes nested script content in arrays and objects', () => {
      const req = {
        body: {
          classes: [{ name: 'Class A' }, { name: '<img src=x onerror=alert(1)>' }],
        },
      } as Request;
      const next = jest.fn() as NextFunction;

      middleware.use(req, {} as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      const classes = (req.body as { classes: Array<{ name: string }> }).classes;
      expect(classes[1].name).not.toContain('<img');
      expect(classes[1].name).not.toContain('onerror');
    });

    it('handles null and undefined values without throwing', () => {
      const req = {
        body: {
          nullableField: null,
          optionalField: undefined,
          school_name: 'Normal Name',
        },
      } as Request;
      const next = jest.fn() as NextFunction;

      middleware.use(req, {} as never, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({
        nullableField: null,
        optionalField: undefined,
        school_name: 'Normal Name',
      });
    });
  });

  describe('xss middleware (integration)', () => {
    let app: INestApplication;
    let httpServer: HttpServer;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [XssTestModule],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
      httpServer = app.getHttpServer() as HttpServer;
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 201 for a safe payload', async () => {
      const response = await request(httpServer)
        .post('/xss-test/42?term=math')
        .send({ school_name: 'North High' })
        .expect(201);

      expect(response.body).toEqual({
        body: { school_name: 'North High' },
        query: { term: 'math' },
        id: '42',
      });
    });

    it('returns 201 and sanitized body for malicious payload in request body', async () => {
      const response = await request(httpServer)
        .post('/xss-test/42')
        .send({ school_name: '<script>alert(1)</script>' })
        .expect(201);

      const responseBody: unknown = response.body;
      expect(responseBody).toBeDefined();
      expect(typeof responseBody).toBe('object');

      const typedBody = responseBody as {
        body?: { school_name?: string };
      };
      const schoolName = typedBody.body?.school_name;

      expect(typeof schoolName).toBe('string');
      expect(schoolName).not.toContain('<script>');
      expect(schoolName).not.toContain('alert(1)');
    });
  });
});
