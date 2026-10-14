import type { Readable } from 'stream';

/** An open blob download: the body stream and, when the service reports it, its length. */
export interface IBlobDownloadStream {
  stream: Readable;
  contentLength?: number;
}
