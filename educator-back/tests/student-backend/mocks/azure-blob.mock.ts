/** Mock for @azure/storage-blob BlobServiceClient */
export const createBlobClientMock = () => {
  const blobMock = {
    upload: jest.fn().mockResolvedValue({ etag: 'mock-etag' }),
    download: jest.fn().mockResolvedValue({ readableStreamBody: { pipe: jest.fn() } }),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(true),
    getProperties: jest.fn().mockResolvedValue({ etag: 'mock-etag', lastModified: new Date() }),
  };

  const containerMock = {
    getBlockBlobClient: jest.fn().mockReturnValue(blobMock),
    exists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(undefined),
  };

  return {
    getContainerClient: jest.fn().mockReturnValue(containerMock),
    blobMock,
    containerMock,
  };
};
