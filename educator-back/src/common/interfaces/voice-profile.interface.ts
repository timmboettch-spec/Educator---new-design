import type { VoiceProfileSource } from 'src/common/constants';

/** Raw row of the per-profile scenario count query. */
export interface IVoiceProfileUsageRow {
  voiceProfileId: string;
  count: string;
}

/**
 * C1: the effective voice attached to a scenario read. Identity only: the
 * reference audio is never exposed here, the worker reads it from blob storage
 * by `id`.
 */
export interface IScenarioVoiceProfile {
  id: string;
  displayName: string;
  source: VoiceProfileSource;
}

/**
 * Uploads a new profile's reference audio once its row id exists, and returns
 * the blob path to record on the row. A throw rolls the row back.
 */
export type VoiceAudioUploader = (voiceProfileId: string) => Promise<string>;

/** Just the fields of a scenario the effective-voice resolver reads. */
export interface IScenarioVoiceInput {
  voiceProfileId?: string | null;
  patientData?: { gender?: string | null } | null;
}

export interface INormalizedVoiceAudio {
  buffer: Buffer;
  durationMs: number;
}

export interface IProcessResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

export interface IVolumeStats {
  maxVolumeDb: number | null;
  histogram0dbSamples: number;
  totalSamples: number;
}

/** An audio container recognised from magic bytes: temp-file extension and ffmpeg demuxer name. */
export interface IAudioContainer {
  ext: string;
  ffmpegFormat: string;
}

export interface IPcmWavInfo {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  durationMs: number;
}
