import * as path from 'path';

import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Request } from 'express';
import { memoryStorage } from 'multer';

/** Allowed MIME types for image uploads. */
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** Maximum allowed image file size in bytes (5 MB). */
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
/** Allowed MIME types for document uploads. */
const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf'];
/** Maximum allowed document file size in bytes (20 MB). */
const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024 + 1;
/** Maximum character length of the sanitized base name used in blob names. */
const MAX_BLOB_BASE_NAME_LENGTH = 50;

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
  private readonly blobContainerName =
    process.env.AZURE_BLOB_DATA_CONTAINER_NAME ?? 'rwai-data-files';
  private containerClient?: ContainerClient;

  constructor() {}

  onModuleInit() {
    if (this.azureConnectionString) {
      try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(
          this.azureConnectionString,
        );
        this.containerClient = blobServiceClient.getContainerClient(this.blobContainerName);
        void this.containerClient.createIfNotExists();
        this.logger.log(`[Azure] Media container "${this.blobContainerName}" ready`);
      } catch (err) {
        this.logger.error(
          `[Azure] Failed to initialize media container "${this.blobContainerName}":`,
          err as Error,
        );
      }
    }
  }

  getMulterConfig() {
    return {
      storage: memoryStorage(),
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        // Only allow image files
        if (ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new Error('Only image files are allowed (jpeg, png, gif, webp)'), false);
        }
      },
      limits: {
        fileSize: MAX_IMAGE_FILE_SIZE_BYTES,
      },
    };
  }

  getFileMulterConfig() {
    return {
      storage: memoryStorage(),
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        // Allow specific document types (currently just PDF)
        if (ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new Error('Only PDF files are allowed'), false);
        }
      },
      limits: {
        fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES,
      },
    };
  }

  async uploadFileToAzure(file: Express.Multer.File): Promise<string> {
    if (!this.containerClient) {
      throw new Error('Azure storage connection string is not configured');
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '-') // Sanitize name for blob storage
      .substring(0, MAX_BLOB_BASE_NAME_LENGTH);
    const blobName = `${name}-${uniqueSuffix}${ext}`;

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype,
      },
    });

    // Return the full URL of the uploaded blob
    return blockBlobClient.url;
  }

  async deleteFile(fileUrl: string): Promise<boolean> {
    if (!this.containerClient || !fileUrl) {
      return false;
    }

    // Fast exit if it's not an Azure URL (e.g. data URL or local /uploads path)
    if (fileUrl.startsWith('data:') || fileUrl.startsWith('/')) {
      return true;
    }

    try {
      const url = new URL(fileUrl);
      // Extract the blob name from the URL path
      // Path format is usually /containerName/blobName
      const pathParts = url.pathname.split('/');
      const blobName = decodeURIComponent(pathParts[pathParts.length - 1]);

      if (!blobName) {
        return false;
      }

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      this.logger.log(`[Azure] Deleted blob: ${blobName}`);
      return true;
    } catch (error) {
      this.logger.error('[Azure] Error deleting file from Azure:', error as Error);
      return false;
    }
  }
}
