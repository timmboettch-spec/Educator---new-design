import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { VoiceProfileConstants } from '../constants/voice-profile.constants';
import type { INormalizedVoiceAudio, IProcessResult } from '../interfaces/voice-profile.interface';
import { ERROR_MSG } from '../messages/error.message';
import { throwAppError } from '../utils/app-error';
import {
  detectAudioContainer,
  parseProbeDuration,
  parseSilenceTotal,
  parseVolumeStats,
  readPcmWavInfo,
} from '../utils/audio-analysis.util';
import { ErrorTypes } from '../utils/messages';
import { runProcess } from '../utils/process-runner.util';
import { LoggerService } from './logger.service';

const AUDIO = VoiceProfileConstants.AUDIO;

/**
 * Validates and normalises an uploaded voice reference with ffmpeg/ffprobe
 * (both must be on PATH — the Dockerfile installs them).
 *
 * 1. ffprobe the duration; reject undecodable input and anything outside 5–30 s.
 * 2. One analysis pass: `silencedetect` (> 50% silence at -50 dB / 0.5 s is
 *    rejected) and `volumedetect` (max_volume >= -0.1 dB AND > 1% of samples in
 *    the 0 dB bin is rejected as clipping).
 * 3. Normalise: downmix to mono first (so loudnorm measures what is kept), trim
 *    leading and trailing silence (silenceremove, areverse, silenceremove,
 *    areverse — only the ends, never mid-sentence pauses), loudnorm to
 *    I=-20 LUFS / TP=-1.5 / LRA=11, resample to 24 kHz, pcm_s16le WAV, cut to 10 s.
 *
 * The container is identified from the upload's magic bytes first (anything else is
 * rejected) and pinned with `-f` plus `-protocol_whitelist file` on every call, so a
 * crafted playlist/concat file cannot make ffmpeg read other files or hosts. The input goes
 * to a private temp directory (never stdin: ffprobe needs to seek, e.g. MP4/M4A with a
 * trailing moov atom) as `input.<ext>`, removed in `finally`. The
 * whole call shares one 20 s deadline; on timeout or caller abort the running
 * child is SIGKILLed.
 */
@Injectable()
export class AudioNormalizerService {
  constructor(private readonly logger: LoggerService) {}

  async normalizeVoiceReference(
    input: Buffer,
    signal?: AbortSignal,
  ): Promise<INormalizedVoiceAudio> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, AUDIO.PROCESS_TIMEOUT_MS);
    const onCallerAbort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });

    let dir: string | undefined;
    try {
      // Decide the demuxer from the bytes, before anything is written or spawned.
      const container = detectAudioContainer(input);
      if (!container) {
        throwAppError(ERROR_MSG.VOICE_PROFILE.UNDECODABLE, ErrorTypes.BAD_REQUEST);
      }
      dir = await mkdtemp(join(tmpdir(), 'voice-profile-'));
      const inputPath = join(dir, `input.${container.ext}`);
      const outputPath = join(dir, 'output.wav');
      await writeFile(inputPath, input);

      const format = container.ffmpegFormat;
      const durationS = await this.probeDuration(inputPath, format, controller.signal);
      this.assertDuration(durationS);
      await this.assertAudible(inputPath, format, durationS, controller.signal);
      await this.transcode(inputPath, outputPath, format, controller.signal);

      const buffer = await readFile(outputPath);
      const info = readPcmWavInfo(buffer);
      if (!info || info.dataBytes === 0) {
        throwAppError(ERROR_MSG.VOICE_PROFILE.UNDECODABLE, ErrorTypes.BAD_REQUEST);
      }
      return { buffer, durationMs: info.durationMs };
    } catch (error) {
      if (timedOut) {
        throwAppError(ERROR_MSG.VOICE_PROFILE.PROCESSING_TIMEOUT, ErrorTypes.BAD_REQUEST);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Input options that pin ffmpeg/ffprobe to the demuxer the magic bytes named and to plain local
   * files: no protocol (http, tcp, concat, ...) a crafted container could reference is allowed.
   * They must come BEFORE the input.
   */
  static inputArgs(format: string): string[] {
    return ['-protocol_whitelist', 'file', '-f', format];
  }

  private async probeDuration(
    inputPath: string,
    format: string,
    signal: AbortSignal,
  ): Promise<number> {
    const result = await this.run(
      AUDIO.FFPROBE_BIN,
      [
        '-v',
        'error',
        ...AudioNormalizerService.inputArgs(format),
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        inputPath,
      ],
      signal,
    );
    const duration = result.code === 0 ? parseProbeDuration(result.stdout.toString('utf8')) : null;
    if (duration === null) {
      throwAppError(ERROR_MSG.VOICE_PROFILE.UNDECODABLE, ErrorTypes.BAD_REQUEST);
    }
    return duration;
  }

  private assertDuration(durationS: number): void {
    const shown = durationS.toFixed(1);
    if (durationS < AUDIO.MIN_DURATION_S) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.TOO_SHORT(shown, AUDIO.MIN_DURATION_S),
        ErrorTypes.BAD_REQUEST,
      );
    }
    if (durationS > AUDIO.MAX_DURATION_S) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.TOO_LONG(shown, AUDIO.MAX_DURATION_S),
        ErrorTypes.BAD_REQUEST,
      );
    }
  }

  private async assertAudible(
    inputPath: string,
    format: string,
    durationS: number,
    signal: AbortSignal,
  ): Promise<void> {
    const filter =
      `silencedetect=noise=${AUDIO.SILENCE_THRESHOLD_DB}dB:d=${AUDIO.SILENCE_MIN_DURATION_S},` +
      'volumedetect';
    const result = await this.run(
      AUDIO.FFMPEG_BIN,
      [
        '-hide_banner',
        '-nostats',
        ...AudioNormalizerService.inputArgs(format),
        '-i',
        inputPath,
        '-af',
        filter,
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    if (result.code !== 0) {
      throwAppError(ERROR_MSG.VOICE_PROFILE.UNDECODABLE, ErrorTypes.BAD_REQUEST);
    }

    const silenceRatio = parseSilenceTotal(result.stderr, durationS) / durationS;
    if (silenceRatio > AUDIO.MAX_SILENCE_RATIO) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.TOO_SILENT(
          Math.round(silenceRatio * 100),
          Math.round(AUDIO.MAX_SILENCE_RATIO * 100),
        ),
        ErrorTypes.BAD_REQUEST,
      );
    }

    const volume = parseVolumeStats(result.stderr);
    const zeroDbRatio =
      volume.totalSamples > 0 ? volume.histogram0dbSamples / volume.totalSamples : 0;
    if (
      volume.maxVolumeDb !== null &&
      volume.maxVolumeDb >= AUDIO.CLIP_MAX_VOLUME_DB &&
      zeroDbRatio > AUDIO.CLIP_MAX_0DB_RATIO
    ) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.CLIPPED((zeroDbRatio * 100).toFixed(1)),
        ErrorTypes.BAD_REQUEST,
      );
    }
  }

  private async transcode(
    inputPath: string,
    outputPath: string,
    format: string,
    signal: AbortSignal,
  ): Promise<void> {
    const result = await this.run(
      AUDIO.FFMPEG_BIN,
      AudioNormalizerService.buildTranscodeArgs(inputPath, outputPath, format),
      signal,
    );
    if (result.code !== 0) {
      throwAppError(ERROR_MSG.VOICE_PROFILE.UNDECODABLE, ErrorTypes.BAD_REQUEST);
    }
  }

  /** The normalisation command line, exposed for tests. */
  static buildTranscodeArgs(inputPath: string, outputPath: string, inputFormat: string): string[] {
    const trim =
      `silenceremove=start_periods=1:start_threshold=${AUDIO.SILENCE_THRESHOLD_DB}dB` +
      `:start_silence=${AUDIO.TRIM_KEEP_SILENCE_S}`;
    const filter = [
      'aformat=channel_layouts=mono',
      trim,
      'areverse',
      trim,
      'areverse',
      `loudnorm=I=${AUDIO.LOUDNORM_I}:TP=${AUDIO.LOUDNORM_TP}:LRA=${AUDIO.LOUDNORM_LRA}`,
      `aresample=${AUDIO.OUTPUT_SAMPLE_RATE}`,
    ].join(',');
    return [
      '-hide_banner',
      '-nostats',
      '-loglevel',
      'error',
      '-y',
      ...AudioNormalizerService.inputArgs(inputFormat),
      '-i',
      inputPath,
      '-af',
      filter,
      '-ac',
      String(AUDIO.OUTPUT_CHANNELS),
      '-ar',
      String(AUDIO.OUTPUT_SAMPLE_RATE),
      '-c:a',
      AUDIO.OUTPUT_CODEC,
      '-t',
      String(AUDIO.OUTPUT_MAX_S),
      '-f',
      'wav',
      outputPath,
    ];
  }

  /** runProcess, with a missing binary mapped to a 503 instead of a 500. */
  private async run(command: string, args: string[], signal: AbortSignal): Promise<IProcessResult> {
    try {
      return await runProcess(command, args, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        this.logger.error(`[AudioNormalizer] ${command} is not installed or not on PATH`);
        throwAppError(
          ERROR_MSG.VOICE_PROFILE.PROCESSING_UNAVAILABLE,
          ErrorTypes.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }
}
