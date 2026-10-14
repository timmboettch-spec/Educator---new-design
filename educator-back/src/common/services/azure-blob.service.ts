import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { LoggerService } from './logger.service';
import type { Readable } from 'stream';
import type { IBlobDownloadStream } from '../interfaces/azure-blob.interface';

@Injectable()
export class AzureBlobService {
  private blobServiceClient?: BlobServiceClient;
  private containerName: string;
  private sharedKeyCredential?: StorageSharedKeyCredential;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const connectionString = this.configService.get<string>('azureBlob.connectionString');
    const explicitAccount = this.configService.get<string>('azureBlob.account');
    const accountFromConnStr = connectionString?.match(/AccountName=([^;]+)/i)?.[1];
    const accountKeyMatch = connectionString?.match(/AccountKey=([^;]+)/i);
    const hasAccountKey = !!accountKeyMatch;

    this.containerName = this.configService.get<string>(
      'azureBlob.profilePictureContainer',
    ) as string;

    if (hasAccountKey && accountKeyMatch && accountFromConnStr && connectionString) {
      this.sharedKeyCredential = new StorageSharedKeyCredential(
        accountFromConnStr,
        accountKeyMatch[1],
      );
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      this.logger.log(
        `Azure Blob Storage → connection string with AccountKey (account: ${accountFromConnStr}, container: ${this.containerName})`,
      );
    } else if (explicitAccount) {
      const url = `https://${explicitAccount}.blob.core.windows.net`;
      this.blobServiceClient = new BlobServiceClient(url, new DefaultAzureCredential());
      this.logger.log(
        `Azure Blob Storage → DefaultAzureCredential (account: ${explicitAccount}, container: ${this.containerName})`,
      );
    } else if (accountFromConnStr) {
      const url = `https://${accountFromConnStr}.blob.core.windows.net`;
      this.blobServiceClient = new BlobServiceClient(url, new DefaultAzureCredential());
      this.logger.log(
        `Azure Blob Storage → DefaultAzureCredential (account: ${accountFromConnStr}, container: ${this.containerName})`,
      );
    } else if (connectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      this.logger.log(`Azure Blob Storage → connection string (container: ${this.containerName})`);
    } else {
      this.logger.warn(
        'Azure Blob Storage NOT configured — set AZURE_STORAGE_ACCOUNT or AZURE_STORAGE_CONNECTION_STRING in .env',
      );
    }
  }

  isConfigured(): boolean {
    return !!this.blobServiceClient;
  }

  async uploadFile(buffer: Buffer, blobName: string, contentType: string): Promise<string> {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage is not configured.');
    }
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return blockBlobClient.url;
  }

  private requireClient(): BlobServiceClient {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage is not configured.');
    }
    return this.blobServiceClient;
  }

  /**
   * Uploads (overwriting) `blobName` in an explicitly named container, creating the
   * container on first use. Unlike `uploadFile`, which is fixed to the profile-picture
   * container, callers choose the container — e.g. voice profiles.
   */
  async uploadToContainer(
    container: string,
    blobName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const containerClient = this.requireClient().getContainerClient(container);
    await containerClient.createIfNotExists();
    await containerClient.getBlockBlobClient(blobName).uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  /** Whether `blobName` exists in `container`. False (not an error) when storage is unconfigured. */
  async existsInContainer(container: string, blobName: string): Promise<boolean> {
    if (!this.blobServiceClient) return false;
    return this.blobServiceClient.getContainerClient(container).getBlobClient(blobName).exists();
  }

  /**
   * Opens a read stream for `blobName` in `container`, or `null` when the blob (or its
   * container) does not exist. Other storage errors propagate.
   */
  async downloadStreamFromContainer(
    container: string,
    blobName: string,
  ): Promise<IBlobDownloadStream | null> {
    const blobClient = this.requireClient().getContainerClient(container).getBlobClient(blobName);
    try {
      const response = await blobClient.download();
      if (!response.readableStreamBody) return null;
      return {
        stream: response.readableStreamBody as unknown as Readable,
        contentLength: response.contentLength,
      };
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 404) return null;
      throw error;
    }
  }

  /** Downloads `blobName` from `container` into memory, or `null` when missing. */
  async downloadToBufferFromContainer(container: string, blobName: string): Promise<Buffer | null> {
    const blobClient = this.requireClient().getContainerClient(container).getBlobClient(blobName);
    try {
      return await blobClient.downloadToBuffer();
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 404) return null;
      throw error;
    }
  }

  /**
   * Generates a time-limited SAS URL for a private blob.
   * Falls back to the original URL if SAS generation fails or blob storage is not configured.
   */
  async generateSasUrl(blobUrl: string, expiryMinutes = 60): Promise<string> {
    if (!this.blobServiceClient || !blobUrl.startsWith('http')) return blobUrl;

    const containerPrefix = `/${this.containerName}/`;
    const idx = blobUrl.indexOf(containerPrefix);
    if (idx === -1) return blobUrl;
    const blobName = blobUrl.substring(idx + containerPrefix.length);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiryMinutes * 60 * 1000);

    try {
      let sasToken: string;
      if (this.sharedKeyCredential) {
        sasToken = generateBlobSASQueryParameters(
          {
            containerName: this.containerName,
            blobName,
            permissions: BlobSASPermissions.parse('r'),
            startsOn,
            expiresOn,
          },
          this.sharedKeyCredential,
        ).toString();
      } else {
        // Requires the managed identity to have the "Storage Blob Delegator" role
        const delegationKey = await this.blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn,
        );
        sasToken = generateBlobSASQueryParameters(
          {
            containerName: this.containerName,
            blobName,
            permissions: BlobSASPermissions.parse('r'),
            startsOn,
            expiresOn,
          },
          delegationKey,
          this.blobServiceClient.accountName,
        ).toString();
      }
      return `${blobUrl}?${sasToken}`;
    } catch (error) {
      this.logger.error(
        `Failed to generate SAS URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      return blobUrl;
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!this.blobServiceClient) return;
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      // Extract full blob path (e.g. "profile-pictures/educator-xxx.jpg") after the container name
      const containerPrefix = `/${this.containerName}/`;
      const idx = fileUrl.indexOf(containerPrefix);
      // Strip any SAS query string
      const blobName =
        idx !== -1
          ? fileUrl.substring(idx + containerPrefix.length).split('?')[0]
          : fileUrl.split('/').pop()?.split('?')[0];
      if (!blobName) return;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    } catch (error) {
      this.logger.error(
        `Azure Delete Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
