/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../../../src/student-backend/guards/jwt-auth.guard';
import { UploadsModule } from '../../../../../src/student-backend/modules/uploads/uploads.module';
import { UploadsService } from '../../../../../src/student-backend/modules/uploads/uploads.service';
import { AUTH_GUARD_MOCK } from '../../../mocks/auth.mock';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiPost } from '../../common/utils/api.helper';
import { STATUS } from '../../common/constants/status-codes';

const ROUTES = {
  IMAGE: '/uploads/image',
  FILE: '/uploads/file',
  DELETE: '/uploads/file',
} as const;

describe('Uploads API (controller)', () => {
  let app: INestApplication;

  // Permissive multer config used in tests so any uploaded file passes the
  // FileInterceptor's filter (the controller instantiates the real
  // UploadsService at decorator time, so we patch its prototype here).
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

  beforeAll(async () => {
    // The controller calls `new UploadsService().getMulterConfig()` directly
    // when its decorators run. Patch the prototype so that constructor path
    // produces a permissive multer config too.
    jest
      .spyOn(UploadsService.prototype, 'getMulterConfig')
      .mockReturnValue(passThroughMulter as ReturnType<UploadsService['getMulterConfig']>);
    jest
      .spyOn(UploadsService.prototype, 'getFileMulterConfig')
      .mockReturnValue(passThroughMulter as ReturnType<UploadsService['getFileMulterConfig']>);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [UploadsModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(AUTH_GUARD_MOCK)
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

  // ─── POST /uploads/image ─────────────────────────────────────────────────────

  describe('POST /uploads/image', () => {
    it('returns 200 with upload metadata for a valid image', async () => {
      const url = 'https://mock-azure.com/test-1234.png';
      mockUploadsService.uploadFileToAzure.mockResolvedValue(url);

      const res = await request(app.getHttpServer())
        .post(ROUTES.IMAGE)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'test.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toEqual({
        success: true,
        filename: 'test-1234.png',
        url,
        message: 'Image uploaded successfully',
      });
      expect(mockUploadsService.uploadFileToAzure).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when no file is attached', async () => {
      const res = await request(app.getHttpServer()).post(ROUTES.IMAGE);

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.uploadFileToAzure).not.toHaveBeenCalled();
    });

    it('returns 500 when Azure upload fails', async () => {
      mockUploadsService.uploadFileToAzure.mockRejectedValue(
        new Error('Azure storage connection string is not configured'),
      );

      const res = await request(app.getHttpServer())
        .post(ROUTES.IMAGE)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'broken.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── POST /uploads/file ──────────────────────────────────────────────────────

  describe('POST /uploads/file', () => {
    it('returns 200 with upload metadata for a valid PDF', async () => {
      const url = 'https://mock-azure.com/document-9876.pdf';
      mockUploadsService.uploadFileToAzure.mockResolvedValue(url);

      const res = await request(app.getHttpServer())
        .post(ROUTES.FILE)
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'document.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toEqual({
        success: true,
        filename: 'document-9876.pdf',
        url,
        message: 'File uploaded successfully',
      });
      expect(mockUploadsService.uploadFileToAzure).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when no file is attached', async () => {
      const res = await request(app.getHttpServer()).post(ROUTES.FILE);

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.uploadFileToAzure).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /uploads/file ────────────────────────────────────────────────────

  describe('DELETE /uploads/file', () => {
    it('returns 200 when delete succeeds', async () => {
      mockUploadsService.deleteFile.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/test.pdf' });

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toEqual({
        success: true,
        message: 'File deleted successfully',
      });
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith('https://mock-azure.com/test.pdf');
    });

    it('returns 400 when url is missing from body', async () => {
      const res = await request(app.getHttpServer()).delete(ROUTES.DELETE).send({});

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
    });

    it('returns 400 when service reports file not found', async () => {
      mockUploadsService.deleteFile.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/missing.pdf' });

      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('returns 500 when delete throws unexpectedly', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(new Error('Azure SDK exploded'));

      const res = await request(app.getHttpServer())
        .delete(ROUTES.DELETE)
        .send({ url: 'https://mock-azure.com/broken.pdf' });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── Misc routing checks ─────────────────────────────────────────────────────

  describe('routing', () => {
    it('GET /uploads/image returns 404 (POST-only route)', async () => {
      const res = await request(app.getHttpServer()).get(ROUTES.IMAGE);
      expect([STATUS.NOT_FOUND, STATUS.METHOD_NOT_ALLOWED]).toContain(res.status);
    });

    it('POST /uploads/unknown returns 404', async () => {
      const res = await apiPost(app, '/uploads/unknown', {});
      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });
});
