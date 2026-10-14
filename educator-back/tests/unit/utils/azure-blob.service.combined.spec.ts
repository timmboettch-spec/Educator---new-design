import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AzureBlobService, LoggerService } from '../../../src/common/services';

const mockFns = {
  deleteIfExists: jest.fn().mockResolvedValue(undefined),
  uploadData: jest.fn().mockResolvedValue(undefined),
  createIfNotExists: jest.fn().mockResolvedValue(undefined),
  getBlockBlobClient: jest.fn(),
  getContainerClient: jest.fn(),
  fromConnectionString: jest.fn(),
};

mockFns.getBlockBlobClient.mockReturnValue({
  uploadData: mockFns.uploadData,
  deleteIfExists: mockFns.deleteIfExists,
  url: 'https://storage.test/container/blob.jpg',
});

mockFns.getContainerClient.mockReturnValue({
  createIfNotExists: mockFns.createIfNotExists,
  getBlockBlobClient: mockFns.getBlockBlobClient,
});

mockFns.fromConnectionString.mockReturnValue({
  getContainerClient: mockFns.getContainerClient,
});

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: (...args: unknown[]): unknown => mockFns.fromConnectionString(...args),
  },
  StorageSharedKeyCredential: jest.fn().mockImplementation(() => ({})),
  BlobSASPermissions: {
    parse: jest.fn().mockReturnValue({}),
  },
  generateBlobSASQueryParameters: jest.fn().mockReturnValue({ toString: () => 'sv=mock&sig=mock' }),
}));

const makeConfig = (connectionString?: string, container?: string): { get: jest.Mock } => ({
  get: jest.fn((key: string): string | undefined => {
    if (key === 'azureBlob.connectionString') return connectionString;
    if (key === 'azureBlob.profilePictureContainer') return container ?? 'profile-pictures';
    return undefined;
  }),
});

const buildService = async (
  connectionString?: string,
  container?: string,
): Promise<AzureBlobService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AzureBlobService,
      { provide: ConfigService, useValue: makeConfig(connectionString, container) },
      {
        provide: LoggerService,
        useValue: {
          log: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          verbose: jest.fn(),
          fatal: jest.fn(),
        },
      },
    ],
  })
    .setLogger({
      log: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
    })
    .compile();
  return module.get(AzureBlobService);
};

describe('AzureBlobService (unit)', () => {
  let service: AzureBlobService;

  beforeEach(async () => {
    service = await buildService(
      'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdGtleQ==',
      'profile-pictures',
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('isConfigured returns true when connection string is set', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('uploadFile calls uploadData with correct headers', async () => {
    const buf = Buffer.from('img');
    const url = await service.uploadFile(buf, 'pic.jpg', 'image/jpeg');
    expect(mockFns.uploadData).toHaveBeenCalledWith(buf, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });
    expect(url).toBe('https://storage.test/container/blob.jpg');
  });

  it('uploadFile calls createIfNotExists without access argument', async () => {
    await service.uploadFile(Buffer.from('x'), 'f.jpg', 'image/jpeg');
    expect(mockFns.createIfNotExists).toHaveBeenCalledWith();
  });

  it('uploadFile uses the configured container name', async () => {
    await service.uploadFile(Buffer.from('x'), 'f.jpg', 'image/jpeg');
    expect(mockFns.getContainerClient).toHaveBeenCalledWith('profile-pictures');
  });

  it('uploadFile rethrows SDK errors', async () => {
    mockFns.uploadData.mockRejectedValueOnce(new Error('Network error'));
    await expect(service.uploadFile(Buffer.from('x'), 'f.jpg', 'image/jpeg')).rejects.toThrow(
      'Network error',
    );
  });

  it('deleteFile removes blob by extracting name from URL', async () => {
    await service.deleteFile('https://storage.test/container/pic.jpg');
    expect(mockFns.getBlockBlobClient).toHaveBeenCalledWith('pic.jpg');
    expect(mockFns.deleteIfExists).toHaveBeenCalled();
  });

  it('deleteFile is a no-op when not configured', async () => {
    const unconfigured = await buildService(undefined, 'profile-pictures');
    await expect(
      unconfigured.deleteFile('https://storage.test/container/pic.jpg'),
    ).resolves.toBeUndefined();
    expect(mockFns.deleteIfExists).not.toHaveBeenCalled();
  });
});

//  Regression

describe('AzureBlobService (regression)', () => {
  afterEach(() => jest.clearAllMocks());

  it('isConfigured returns false when connection string is missing', async () => {
    const service = await buildService(undefined, 'profile-pictures');
    expect(service.isConfigured()).toBe(false);
  });

  it('uploadFile throws when not configured', async () => {
    const service = await buildService(undefined);
    await expect(service.uploadFile(Buffer.from('x'), 'f.jpg', 'image/jpeg')).rejects.toThrow(
      'Azure Blob Storage is not configured.',
    );
  });

  it('container defaults to "profile-pictures" when env var is absent', async () => {
    const service = await buildService('conn-string', undefined);
    await service.uploadFile(Buffer.from('x'), 'f.jpg', 'image/jpeg');
    expect(mockFns.getContainerClient).toHaveBeenCalledWith('profile-pictures');
  });

  it('deleteFile silently swallows SDK errors', async () => {
    mockFns.deleteIfExists.mockRejectedValueOnce(new Error('SDK error'));
    const service = await buildService('conn-string', 'profile-pictures');
    await expect(
      service.deleteFile('https://storage.test/container/pic.jpg'),
    ).resolves.toBeUndefined();
  });

  it('deleteFile is a no-op when URL has no extractable blob name', async () => {
    const service = await buildService('conn-string', 'profile-pictures');
    await service.deleteFile('https://storage.test/');
    expect(mockFns.deleteIfExists).not.toHaveBeenCalled();
  });
});

//  Integration

describe('AzureBlobService (integration)', () => {
  let service: AzureBlobService;

  beforeEach(async () => {
    service = await buildService(
      'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdGtleQ==',
      'profile-pictures',
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('module compiles and service is resolvable', () => {
    expect(service).toBeDefined();
  });

  it('full upload flow returns blob URL', async () => {
    const url = await service.uploadFile(
      Buffer.from('data'),
      'profile-pictures/u-1.jpg',
      'image/jpeg',
    );
    expect(url).toMatch(/^https?:\/\//);
  });

  it('full delete flow completes without error', async () => {
    await expect(
      service.deleteFile('https://storage.test/container/u-1.jpg'),
    ).resolves.toBeUndefined();
    expect(mockFns.deleteIfExists).toHaveBeenCalledTimes(1);
  });

  it('upload then delete — both SDK calls made in order', async () => {
    const callOrder: string[] = [];
    mockFns.uploadData.mockImplementationOnce((): Promise<void> => {
      callOrder.push('upload');
      return Promise.resolve();
    });
    mockFns.deleteIfExists.mockImplementationOnce((): Promise<void> => {
      callOrder.push('delete');
      return Promise.resolve();
    });

    await service.uploadFile(Buffer.from('x'), 'pic.jpg', 'image/jpeg');
    await service.deleteFile('https://storage.test/container/pic.jpg');

    expect(callOrder).toEqual(['upload', 'delete']);
  });
});
