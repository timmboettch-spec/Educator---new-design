import { UploadsService } from '@/modules/uploads/uploads.service';
import { memoryStorage } from 'multer';
import { type ContainerClient } from '@azure/storage-blob';
import type { Request } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { LoggerService } from 'src/common/services';

/**
 * Builds a minimal LoggerService stand-in for direct `new UploadsService(...)`
 * construction in these tests.
 */
function buildMockLoggerService(): LoggerService {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  } as unknown as LoggerService;
}

/**
 * Builds a minimal ConfigService stand-in that mirrors the `azureBlob` namespace
 * (src/common/config/azure-blob.config.ts), reading live `process.env` at call
 * time so existing tests that mutate `process.env.AZURE_*` before constructing
 * an `UploadsService` keep working unchanged.
 */
function buildMockConfigService(): ConfigService {
  return {
    get: (key: string) => {
      switch (key) {
        case 'azureBlob.connectionString':
          return process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
        case 'azureBlob.uploadsContainer':
          return process.env.AZURE_BLOB_DATA_CONTAINER_NAME || 'rwai-data-files';
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService;
}

// Mock Azure Blob Storage
const uploadDataMock = jest.fn();
const deleteIfExistsMock = jest.fn();
const getBlockBlobClientMock = jest.fn((_name: string) => ({
  uploadData: uploadDataMock,
  deleteIfExists: deleteIfExistsMock,
  url: `https://mock.blob.core.windows.net/container/${_name}`,
}));
const createIfNotExistsMock = jest.fn().mockResolvedValue({});
const containerClientMock = {
  createIfNotExists: createIfNotExistsMock,
  getBlockBlobClient: getBlockBlobClientMock,
} as unknown as ContainerClient;

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({
      getContainerClient: jest.fn(() => containerClientMock),
    })),
  },
}));

jest.mock('multer', () => ({
  memoryStorage: jest.fn(),
}));

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'mock-connection-string';
    process.env.AZURE_BLOB_DATA_CONTAINER_NAME = 'rwai-data-files';
    service = new UploadsService(buildMockConfigService(), buildMockLoggerService());
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_BLOB_DATA_CONTAINER_NAME;
  });

  describe('onModuleInit', () => {
    it('should initialize Azure container client', async () => {
      await service.onModuleInit();
      expect(containerClientMock.createIfNotExists).toHaveBeenCalled();
    });
  });

  describe('getMulterConfig', () => {
    it('should return multer configuration with memoryStorage', () => {
      const config = UploadsService.getMulterConfig();

      expect(config).toHaveProperty('storage');
      expect(config).toHaveProperty('fileFilter');
      expect(config).toHaveProperty('limits');
      expect(config.limits.fileSize).toBe(5 * 1024 * 1024);
      expect(memoryStorage).toHaveBeenCalled();
    });

    it('should allow valid image mime types', () => {
      const config = UploadsService.getMulterConfig();
      const callback = jest.fn();

      const file = { mimetype: 'image/png' } as Express.Multer.File;

      config.fileFilter({} as unknown as Request, file, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('getFileMulterConfig', () => {
    it('should return multer configuration for PDF files', () => {
      const config = UploadsService.getFileMulterConfig();

      expect(config).toHaveProperty('storage');
      expect(config.limits.fileSize).toBe(20 * 1024 * 1024 + 1);
      expect(memoryStorage).toHaveBeenCalled();
    });

    it('should allow valid pdf mime type', () => {
      const config = UploadsService.getFileMulterConfig();
      const callback = jest.fn();

      const file = { mimetype: 'application/pdf' } as Express.Multer.File;

      config.fileFilter({} as unknown as Request, file, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('uploadFileToAzure', () => {
    const mockFile = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('test content'),
    } as Express.Multer.File;

    it('should upload file and return Azure URL', async () => {
      await service.onModuleInit();
      uploadDataMock.mockResolvedValue({});

      const url = await service.uploadFileToAzure(mockFile);

      expect(url).toContain('https://mock.blob.core.windows.net/container/test-');
      expect(url).toContain('.pdf');
      expect(uploadDataMock).toHaveBeenCalled();
    });

    it('should throw error if storage is not initialized', async () => {
      const svc = new UploadsService(buildMockConfigService(), buildMockLoggerService());
      // Don't call onModuleInit
      await expect(svc.uploadFileToAzure(mockFile)).rejects.toThrow(
        'Azure storage connection string is not configured',
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file from Azure if it is an Azure URL', async () => {
      await service.onModuleInit();
      deleteIfExistsMock.mockResolvedValue(true);

      const url = 'https://mock.blob.core.windows.net/container/test-123.pdf';
      const result = await service.deleteFile(url);

      expect(result).toBe(true);
      expect(getBlockBlobClientMock).toHaveBeenCalledWith('test-123.pdf');
      expect(deleteIfExistsMock).toHaveBeenCalled();
    });

    it('should skip deletion for local or data URLs and return true', async () => {
      await service.onModuleInit();

      const dataUrl = 'data:application/pdf;base64,abc';
      const result = await service.deleteFile(dataUrl);

      expect(result).toBe(true);
      expect(deleteIfExistsMock).not.toHaveBeenCalled();
    });
  });
});
