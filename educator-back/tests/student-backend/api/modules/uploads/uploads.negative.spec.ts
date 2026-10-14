/// <reference types="jest" />
import {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UploadsModule } from '../../../../../src/student-backend/modules/uploads/uploads.module';
import { UploadsService } from '../../../../../src/student-backend/modules/uploads/uploads.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { STATUS } from '../../common/constants/status-codes';

const ROUTES = {
  IMAGE: '/uploads/image',
  FILE: '/uploads/file',
  DELETE: '/uploads/file',
} as const;

describe('Uploads API — Negative Tests', () => {
  let app: INestApplication;

  const passThroughMulter = {
    storage: require('multer').memoryStorage(),
    fileFilter: (
      _req: Express.Request,
      _file: Express.Multer.File,
      cb: (err: Error | null, ok: boolean) => void,
    ) => cb(null, true),
    limits: { fileSize: 10 * 1024 * 1024 },
  };

  const mockUploadsService = {
    uploadFileToAzure: jest.fn(),
    deleteFile: jest.fn(),
    getMulterConfig: jest.fn(() => passThroughMulter),
    getFileMulterConfig: jest.fn(() => passThroughMulter),
    onModuleInit: jest.fn(),
  };

  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const pdfBuffer = Buffer.from('%PDF-1.4');

  beforeAll(async () => {
    // Controller wires its FileInterceptor via `UploadsService.getMulterConfig()`
    // (a static method) at decorator-load time, so patch the static method to
    // avoid the real filters.
    jest
      .spyOn(UploadsService, 'getMulterConfig')
      .mockReturnValue(passThroughMulter as ReturnType<typeof UploadsService.getMulterConfig>);
    jest
      .spyOn(UploadsService, 'getFileMulterConfig')
      .mockReturnValue(passThroughMulter as ReturnType<typeof UploadsService.getFileMulterConfig>);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [UploadsModule],
    })
      .overrideProvider(UploadsService)
      .useValue(mockUploadsService)
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockUploadsService.uploadFileToAzure.mockReset();
    mockUploadsService.deleteFile.mockReset();
  });

  // ─── 400 – Bad Request ────────────────────────────────────────────────────────

  describe('400 – Bad Request', () => {
    it('POST /uploads/image returns 400 when no file is attached', async () => {
      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE);

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.uploadFileToAzure).not.toHaveBeenCalled();
    });

    it('POST /uploads/file returns 400 when no file is attached', async () => {
      const res = await request(app.getHttpServer()).post(ROUTES.FILE);

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.uploadFileToAzure).not.toHaveBeenCalled();
    });

    it('POST /uploads/image returns 400 when file is attached under wrong field name', async () => {
      const res = await request(app.getHttpServer())
        .post(ROUTES.IMAGE)
        .attach('wrongFieldName', pngBuffer, {
          filename: 'x.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.uploadFileToAzure).not.toHaveBeenCalled();
    });

    it('DELETE /uploads/file returns 400 when body is empty', async () => {
      const res = await request(app.getHttpServer()).delete(ROUTES.DELETE).send({});

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
    });

    it('DELETE /uploads/file returns 400 when url is an empty string', async () => {
      const res = await request(app.getHttpServer()).delete(ROUTES.DELETE).send({ url: '' });

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
    });

    it('DELETE /uploads/file returns 400 when service reports file not found', async () => {
      mockUploadsService.deleteFile.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/missing.pdf' });

      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('POST /uploads/image returns 400 when service throws BadRequest', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new BadRequestException('Invalid file payload'),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE).attach('file', pngBuffer, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('DELETE /uploads/file returns 400 when body is malformed JSON', async () => {
      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .set('Content-Type', 'application/json')
        .send('{"url": "https://x.com/y.pdf"');

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
    });
  });

  // ─── 401 – Unauthorized ───────────────────────────────────────────────────────

  describe('401 – Unauthorized', () => {
    it('POST /uploads/image returns 401 when service rejects with Unauthorized', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new UnauthorizedException('Invalid or expired token'),
      );

      const res = await request(app.getHttpServer())
        .post(ROUTES.IMAGE)
        .set('Authorization', 'Bearer invalid-token')
        .attach('file', pngBuffer, {
          filename: 'x.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });

    it('DELETE /uploads/file returns 401 when token is expired', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(
        new UnauthorizedException('Token has expired'),
      );

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .set('Authorization', 'Bearer expired-token')
        .send({ url: 'https://mock-azure.com/x.pdf' });

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });
  });

  // ─── 403 – Forbidden ──────────────────────────────────────────────────────────

  describe('403 – Forbidden', () => {
    it('POST /uploads/file returns 403 when user lacks permission to upload', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new ForbiddenException('You do not have permission to upload files'),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.FILE).attach('file', pdfBuffer, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(STATUS.FORBIDDEN);
    });

    it('DELETE /uploads/file returns 403 when user lacks permission to delete', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(
        new ForbiddenException('Delete is restricted to administrators'),
      );

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/x.pdf' });

      expect(res.status).toBe(STATUS.FORBIDDEN);
    });
  });

  // ─── 404 – Not Found ──────────────────────────────────────────────────────────

  describe('404 – Not Found', () => {
    it('POST /uploads/unknown returns 404', async () => {
      const res = await request(app.getHttpServer()).post('/uploads/unknown').send({});

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('DELETE /uploads/file returns 404 when service reports blob missing', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(new NotFoundException('Blob not found'));

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/missing.pdf' });

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 405 – Method Not Allowed ─────────────────────────────────────────────────

  describe('405 – Method Not Allowed', () => {
    it('GET /uploads/image returns 404 or 405 (POST-only route)', async () => {
      const res = await request(app.getHttpServer()).get(ROUTES.IMAGE);
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });

    it('PUT /uploads/file returns 404 or 405', async () => {
      const res = await request(app.getHttpServer()).put(ROUTES.FILE).send({});
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });

    it('PATCH /uploads/file returns 404 or 405', async () => {
      const res = await request(app.getHttpServer()).patch(ROUTES.FILE).send({});
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });
  });

  // ─── 408 – Request Timeout ────────────────────────────────────────────────────

  describe('408 – Request Timeout', () => {
    it('POST /uploads/image returns 408 when upload times out', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new HttpException('Request Timeout', STATUS.REQUEST_TIMEOUT),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE).attach('file', pngBuffer, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(STATUS.REQUEST_TIMEOUT);
    });
  });

  // ─── 409 – Conflict ───────────────────────────────────────────────────────────

  describe('409 – Conflict', () => {
    it('POST /uploads/file returns 409 when a blob with same name already exists', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new ConflictException('Blob already exists'),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.FILE).attach('file', pdfBuffer, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(STATUS.CONFLICT);
    });
  });

  // ─── 413 / 415 – Payload / Media Type Issues ─────────────────────────────────

  describe('415 – Unsupported Media Type', () => {
    it('POST /uploads/image returns 415 when service rejects media type', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new HttpException('Unsupported Media Type', STATUS.UNSUPPORTED_MEDIA_TYPE),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE).attach('file', pngBuffer, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(STATUS.UNSUPPORTED_MEDIA_TYPE);
    });
  });

  // ─── 422 – Unprocessable Entity ───────────────────────────────────────────────

  describe('422 – Unprocessable Entity', () => {
    it('DELETE /uploads/file returns 422 when url format is invalid', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(
        new UnprocessableEntityException('Invalid file URL format'),
      );

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: '!!not-a-url!!' });

      expect(res.status).toBe(STATUS.UNPROCESSABLE_ENTITY);
    });
  });

  // ─── 429 – Too Many Requests ──────────────────────────────────────────────────

  describe('429 – Too Many Requests', () => {
    it('POST /uploads/image returns 429 when rate limit is exceeded', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new HttpException('Too Many Requests', STATUS.TOO_MANY_REQUESTS),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE).attach('file', pngBuffer, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(STATUS.TOO_MANY_REQUESTS);
    });
  });

  // ─── 500 – Internal Server Error ─────────────────────────────────────────────

  describe('500 – Internal Server Error', () => {
    it('POST /uploads/image returns 500 when Azure storage is not configured', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new Error('Azure storage connection string is not configured'),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE).attach('file', pngBuffer, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });

    it('POST /uploads/file returns 500 when upload throws unexpectedly', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(new Error('Network unreachable'));

      const res = await request(app.getHttpServer()).post(ROUTES.FILE).attach('file', pdfBuffer, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });

    it('DELETE /uploads/file returns 500 when delete throws unexpectedly', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(new Error('Azure SDK exploded'));

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/x.pdf' });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── 502 – Bad Gateway ───────────────────────────────────────────────────────

  describe('502 – Bad Gateway', () => {
    it('POST /uploads/image returns 502 when upstream returns invalid response', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new HttpException('Bad Gateway', STATUS.BAD_GATEWAY),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE).attach('file', pngBuffer, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(STATUS.BAD_GATEWAY);
    });
  });

  // ─── 503 – Service Unavailable ───────────────────────────────────────────────

  describe('503 – Service Unavailable', () => {
    it('POST /uploads/file returns 503 when Azure is temporarily unavailable', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new HttpException('Service Unavailable', STATUS.SERVICE_UNAVAILABLE),
      );

      const res = await request(app.getHttpServer()).post(ROUTES.FILE).attach('file', pdfBuffer, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(STATUS.SERVICE_UNAVAILABLE);
    });
  });

  // ─── 504 – Gateway Timeout ────────────────────────────────────────────────────

  describe('504 – Gateway Timeout', () => {
    it('DELETE /uploads/file returns 504 when upstream does not respond in time', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(
        new HttpException('Gateway Timeout', STATUS.GATEWAY_TIMEOUT),
      );

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/x.pdf' });

      expect(res.status).toBe(STATUS.GATEWAY_TIMEOUT);
    });
  });
});
