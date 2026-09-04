import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { Injectable, Logger } from '@nestjs/common';

import { type ConversationProvider, type PatientContext } from './conversation-provider.interface';

interface ConversationPattern {
  keywords: string[];
  response: string;
  weight?: number;
}

@Injectable()
export class StaticResponseProvider implements ConversationProvider {
  private readonly logger = new Logger(StaticResponseProvider.name);
  private responses: Map<string, ConversationPattern[]> = new Map();
  private containerClient?: ContainerClient;
  private loadPromise: Promise<void>;

  constructor() {
    const azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
    const blobContainerName =
      process.env.AZURE_BLOB_CONTAINER_NAME ??
      process.env.AZURE_STORAGE_CONTAINER_NAME ??
      'json-data';
    const blobPrefix = process.env.AZURE_BLOB_PREFIX ?? '';

    if (azureConnectionString.trim()) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(azureConnectionString);
      this.containerClient = blobServiceClient.getContainerClient(blobContainerName);

      const prefix = blobPrefix.trim().replace(/^\/+|\/+$/g, '');
      const blobName = prefix
        ? `${prefix}/conversation-responses.json`
        : 'conversation-responses.json';
      this.loadPromise = this.loadResponses(blobName);
    } else {
      this.loadPromise = Promise.resolve();
    }
  }

  async generateResponse(
    studentText: string,
    patientContext: PatientContext,
  ): Promise<string | null> {
    await this.loadPromise;
    const lowerText = studentText.toLowerCase().trim();

    // Try to find matching pattern
    const scenarioResponses = this.responses.get(patientContext.scenarioId);
    if (scenarioResponses) {
      const match = this.findMatch(lowerText, scenarioResponses);
      if (match) {
        return match.response;
      }
    }

    return null; // Return null to trigger fallback
  }

  private findMatch(text: string, patterns: ConversationPattern[]): ConversationPattern | null {
    for (const pattern of patterns) {
      if (pattern.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
        return pattern;
      }
    }
    return null;
  }

  private async loadResponses(blobName: string): Promise<void> {
    if (!this.containerClient) {
      return;
    }
    try {
      await this.containerClient.createIfNotExists();
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      const buffer = await blobClient.downloadToBuffer();
      const parsed: unknown = JSON.parse(buffer.toString('utf-8'));

      // Expected shape: { [scenarioId]: ConversationPattern[] }
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed as Record<string, unknown>).forEach(([scenarioId, patterns]) => {
          if (Array.isArray(patterns)) {
            this.responses.set(scenarioId, patterns as ConversationPattern[]);
          }
        });
      }
    } catch (error) {
      this.logger.error(
        `Error loading static responses: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
