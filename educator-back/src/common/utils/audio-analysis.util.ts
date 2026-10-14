import type {
  IAudioContainer,
  IPcmWavInfo,
  IVolumeStats,
} from '../interfaces/voice-profile.interface';

/**
 * Parsers for ffprobe/ffmpeg output, used by AudioNormalizerService. Pure and
 * tolerant: malformed input yields `null`/zero rather than throwing, and the
 * caller decides what that means.
 */

/** `ffprobe -show_entries format=duration -of json` → seconds, or null when absent/invalid. */
export function parseProbeDuration(stdout: string): number | null {
  try {
    const parsed = JSON.parse(stdout) as { format?: { duration?: unknown } };
    const duration = Number(parsed?.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

/**
 * Total silence reported by `silencedetect`, in seconds. A `silence_start`
 * with no matching `silence_end` (silence running to EOF, which some ffmpeg
 * versions leave unterminated) counts up to `totalDurationS`.
 */
export function parseSilenceTotal(stderr: string, totalDurationS: number): number {
  let total = 0;
  let openStart: number | null = null;
  const pattern = /silence_(start|end):\s*(-?[\d.]+)(?:\s*\|\s*silence_duration:\s*([\d.]+))?/g;
  for (const match of stderr.matchAll(pattern)) {
    const [, kind, value, duration] = match;
    if (kind === 'start') {
      openStart = Math.max(0, Number(value));
    } else {
      total += duration !== undefined ? Number(duration) : Number(value) - (openStart ?? 0);
      openStart = null;
    }
  }
  if (openStart !== null && totalDurationS > openStart) {
    total += totalDurationS - openStart;
  }
  return Math.min(total, totalDurationS);
}

/**
 * `volumedetect` stats: max_volume, samples in the 0 dB bin, total samples.
 *
 * ffmpeg 8 can print an early block with `n_samples: 0` before the real one,
 * so every block (each starts at its `n_samples:` line) is parsed and the
 * values come from the LAST block that saw samples. All three values are read
 * from that one block, never mixed across blocks.
 */
export function parseVolumeStats(stderr: string): IVolumeStats {
  const starts = [...stderr.matchAll(/n_samples:\s*\d+/g)].map((m) => m.index ?? 0);
  let chosen: string | null = null;
  starts.forEach((start, i) => {
    const block = stderr.slice(start, starts[i + 1] ?? stderr.length);
    if (Number(/n_samples:\s*(\d+)/.exec(block)?.[1]) > 0) chosen = block;
  });
  if (chosen === null) {
    return { maxVolumeDb: null, histogram0dbSamples: 0, totalSamples: 0 };
  }
  const block: string = chosen;
  const max = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(block);
  const zeroDb = /histogram_0db:\s*(\d+)/.exec(block);
  const total = /n_samples:\s*(\d+)/.exec(block);
  const maxVolumeDb = max && max[1] !== '-inf' ? Number(max[1]) : null;
  return {
    maxVolumeDb: Number.isFinite(maxVolumeDb) ? maxVolumeDb : null,
    histogram0dbSamples: zeroDb ? Number(zeroDb[1]) : 0,
    totalSamples: total ? Number(total[1]) : 0,
  };
}

/**
 * Reads a RIFF/WAVE header: format, channels, rate, bit depth and the `data`
 * chunk size, walking chunks so a LIST/INFO chunk before `data` is skipped.
 * Returns null for anything that is not a well-formed WAV.
 */
export function readPcmWavInfo(buffer: Buffer): IPcmWavInfo | null {
  if (
    buffer.length < 12 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null;
  }
  let offset = 12;
  let fmt: Omit<IPcmWavInfo, 'dataBytes' | 'durationMs'> | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buffer.length) {
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt || fmt.sampleRate === 0 || fmt.channels === 0 || fmt.bitsPerSample === 0) {
        return null;
      }
      const dataBytes = Math.min(size, buffer.length - body);
      const bytesPerSecond = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
      return { ...fmt, dataBytes, durationMs: Math.round((dataBytes / bytesPerSecond) * 1000) };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/**
 * Identifies the audio container from its magic bytes, or null when it is none we accept. The
 * result pins the demuxer (`-f`) and the temp-file extension, so ffmpeg never probes the content
 * and cannot be steered into another demuxer, e.g. an HLS/`#EXTM3U` playlist whose segment URLs
 * would make ffmpeg fetch files or hosts of the attacker's choosing. The upload's MIME type is
 * client-supplied and says nothing about the bytes, so it is not consulted here.
 */
export function detectAudioContainer(buffer: Buffer): IAudioContainer | null {
  if (buffer.length < 12) return null;
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WAVE') {
    return { ext: 'wav', ffmpegFormat: 'wav' };
  }
  if (
    buffer.toString('latin1', 0, 3) === 'ID3' ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return { ext: 'mp3', ffmpegFormat: 'mp3' };
  }
  if (buffer.toString('latin1', 4, 8) === 'ftyp') {
    return { ext: 'm4a', ffmpegFormat: 'mov' };
  }
  if (buffer.toString('latin1', 0, 4) === 'OggS') {
    return { ext: 'ogg', ffmpegFormat: 'ogg' };
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { ext: 'webm', ffmpegFormat: 'matroska' };
  }
  if (buffer.toString('latin1', 0, 4) === 'fLaC') {
    return { ext: 'flac', ffmpegFormat: 'flac' };
  }
  return null;
}
