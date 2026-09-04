import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

@Injectable()
export class AzureBlobService {
  private readonly logger = new Logger(AzureBlobService.name);
  private containerClient?: ContainerClient;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING');
    const containerName =
      this.configService.get<string>('AZURE_STORAGE_CONTAINER') ?? 'profile-pictures';

    if (!connectionString || !containerName) {
      return;
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = blobServiceClient.getContainerClient(containerName);
    this.logger.log(`Azure Blob Storage configured for container: ${containerName}`);
  }

  async uploadFile(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
    if (!this.containerClient) {
      throw new Error(
        'Azure Blob Storage is not configured. Check AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER.',
      );
    }

    await this.containerClient.createIfNotExists({ access: 'blob' });
    const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return blockBlobClient.url;
  }
}
