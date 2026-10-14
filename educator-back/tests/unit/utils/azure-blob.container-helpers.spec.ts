import { Readable } from 'stream';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AzureBlobService, LoggerService } from '../../../src/common/services';

const blob = {
  exists: jest.fn(),
  download: jest.fn(),
  downloadToBuffer: jest.fn(),
};
const blockBlob = { uploadData: jest.fn().mockResolvedValue(undefined) };
const container = {
  createIfNotExists: jest.fn().mockResolvedValue(undefined),
  getBlockBlobClient: jest.fn().mockReturnValue(blockBlob),
  getBlobClient: jest.fn().mockReturnValue(blob),
};
const serviceClient = { getContainerClient: jest.fn().mockReturnValue(container) };

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: { fromConnectionString: (): unknown => serviceClient },
  StorageSharedKeyCredential: jest.fn().mockImplementation(() => ({})),
  BlobSASPermissions: { parse: jest.fn() },
  generateBlobSASQueryParameters: jest.fn(),
}));

const quietLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

async function build(connectionString?: string): Promise<AzureBlobService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AzureBlobService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string): string | undefined => {
            if (key === 'azureBlob.connectionString') return connectionString;
            if (key === 'azureBlob.profilePictureContainer') return 'profile-pictures';
            return undefined;
          }),
        },
      },
      { provide: LoggerService, useValue: quietLogger },
    ],
  }).compile();
  return module.get(AzureBlobService);
}

const CONN = 'DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=a2V5;EndpointSuffix=x';

describe('AzureBlobService container-parameterized helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploadToContainer targets the given container, creates it, and sets the content type', async () => {
    const service = await build(CONN);
    await service.uploadToContainer(
      'voice-profiles',
      'voices/a/voice.wav',
      Buffer.from('x'),
      'audio/wav',
    );

    expect(serviceClient.getContainerClient).toHaveBeenCalledWith('voice-profiles');
    expect(container.createIfNotExists).toHaveBeenCalled();
    expect(container.getBlockBlobClient).toHaveBeenCalledWith('voices/a/voice.wav');
    expect(blockBlob.uploadData).toHaveBeenCalledWith(Buffer.from('x'), {
      blobHTTPHeaders: { blobContentType: 'audio/wav' },
    });
  });

  it('uploadToContainer throws when storage is not configured', async () => {
    const service = await build(undefined);
    await expect(
      service.uploadToContainer('voice-profiles', 'b', Buffer.from('x'), 'audio/wav'),
    ).rejects.toThrow('not configured');
  });

  it('existsInContainer returns false without storage, and the blob answer with it', async () => {
    expect(await (await build(undefined)).existsInContainer('c', 'b')).toBe(false);
    blob.exists.mockResolvedValue(true);
    expect(await (await build(CONN)).existsInContainer('c', 'b')).toBe(true);
  });

  it('downloadStreamFromContainer returns the stream and length', async () => {
    const body = Readable.from([Buffer.from('RIFF')]);
    blob.download.mockResolvedValue({ readableStreamBody: body, contentLength: 4 });
    const result = await (await build(CONN)).downloadStreamFromContainer('c', 'b');
    expect(result).toEqual({ stream: body, contentLength: 4 });
  });

  it('downloadStreamFromContainer maps a 404 to null and rethrows anything else', async () => {
    const service = await build(CONN);
    blob.download.mockRejectedValueOnce(Object.assign(new Error('nope'), { statusCode: 404 }));
    expect(await service.downloadStreamFromContainer('c', 'b')).toBeNull();
    blob.download.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    await expect(service.downloadStreamFromContainer('c', 'b')).rejects.toThrow('boom');
  });

  it('downloadToBufferFromContainer returns bytes, or null on 404', async () => {
    const service = await build(CONN);
    blob.downloadToBuffer.mockResolvedValueOnce(Buffer.from('wav'));
    expect(await service.downloadToBufferFromContainer('c', 'b')).toEqual(Buffer.from('wav'));
    blob.downloadToBuffer.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 404 }));
    expect(await service.downloadToBufferFromContainer('c', 'b')).toBeNull();
  });
});
