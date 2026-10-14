import { readFileSync } from 'fs';
import { join } from 'path';
import {
  detectAudioContainer,
  parseProbeDuration,
  parseSilenceTotal,
  parseVolumeStats,
  readPcmWavInfo,
} from 'src/common/utils/audio-analysis.util';

describe('audio-analysis.util', () => {
  describe('parseProbeDuration', () => {
    it('reads format.duration', () => {
      expect(parseProbeDuration('{"format":{"duration":"10.500000"}}')).toBe(10.5);
    });

    it.each([
      '{}',
      '{\n\n}',
      'not json',
      '{"format":{"duration":"N/A"}}',
      '{"format":{"duration":"0"}}',
    ])('returns null for %p', (input) => {
      expect(parseProbeDuration(input)).toBeNull();
    });
  });

  describe('parseSilenceTotal', () => {
    it('sums every reported silence_duration', () => {
      const stderr = [
        '[silencedetect @ 0x1] silence_start: 0',
        '[silencedetect @ 0x1] silence_end: 1.00007 | silence_duration: 1.00007',
        '[silencedetect @ 0x1] silence_start: 8.99995',
        '[silencedetect @ 0x1] silence_end: 10.5 | silence_duration: 1.50005',
      ].join('\n');
      expect(parseSilenceTotal(stderr, 10.5)).toBeCloseTo(2.5, 3);
    });

    it('counts an unterminated trailing silence up to the end', () => {
      expect(parseSilenceTotal('silence_start: 6\n', 8)).toBe(2);
    });

    it('never exceeds the total duration', () => {
      expect(parseSilenceTotal('silence_start: 0\nsilence_end: 9 | silence_duration: 9', 8)).toBe(
        8,
      );
    });

    it('is zero when nothing is reported', () => {
      expect(parseSilenceTotal('', 8)).toBe(0);
    });
  });

  describe('parseVolumeStats', () => {
    it('reads max_volume, the 0 dB bin and n_samples', () => {
      const stderr = 'n_samples: 128000\nmax_volume: 0.0 dB\nhistogram_0db: 97920\n';
      expect(parseVolumeStats(stderr)).toEqual({
        maxVolumeDb: 0,
        histogram0dbSamples: 97920,
        totalSamples: 128000,
      });
    });

    it('treats a missing 0 dB bin as zero and -inf as unknown', () => {
      expect(parseVolumeStats('n_samples: 10\nmax_volume: -inf dB\n')).toEqual({
        maxVolumeDb: null,
        histogram0dbSamples: 0,
        totalSamples: 10,
      });
    });
  });

  describe('parseVolumeStats with several volumedetect blocks (ffmpeg 8)', () => {
    const emptyBlock = '[Parsed_volumedetect_1 @ 0x6000] n_samples: 0\n';
    const realBlock = [
      '[Parsed_volumedetect_1 @ 0x6000] n_samples: 128000',
      '[Parsed_volumedetect_1 @ 0x6000] mean_volume: -9.1 dB',
      '[Parsed_volumedetect_1 @ 0x6000] max_volume: 0.0 dB',
      '[Parsed_volumedetect_1 @ 0x6000] histogram_0db: 97920',
      '',
    ].join('\n');

    it('reads the last block with samples, not the early n_samples: 0 block', () => {
      expect(parseVolumeStats(emptyBlock + realBlock)).toEqual({
        maxVolumeDb: 0,
        histogram0dbSamples: 97920,
        totalSamples: 128000,
      });
    });

    it('does not mix values across blocks (values come from one block)', () => {
      const first =
        '[Parsed_volumedetect_0 @ 0x1] n_samples: 500\n[Parsed_volumedetect_0 @ 0x1] max_volume: -3.0 dB\n[Parsed_volumedetect_0 @ 0x1] histogram_0db: 7\n';
      const stderr = first + realBlock;
      expect(parseVolumeStats(stderr)).toEqual({
        maxVolumeDb: 0,
        histogram0dbSamples: 97920,
        totalSamples: 128000,
      });
    });

    it('ignores a trailing empty block after the real one', () => {
      expect(parseVolumeStats(realBlock + emptyBlock).totalSamples).toBe(128000);
    });

    it('reports zero samples when every block is empty', () => {
      expect(parseVolumeStats(emptyBlock + emptyBlock)).toEqual({
        maxVolumeDb: null,
        histogram0dbSamples: 0,
        totalSamples: 0,
      });
    });
  });

  describe('readPcmWavInfo', () => {
    it('reads the contract fixture (24 kHz mono PCM16)', () => {
      const wav = readFileSync(join(__dirname, 'fixtures', 'tone-24k-pcm16.wav'));
      const info = readPcmWavInfo(wav);
      expect(info).toEqual(
        expect.objectContaining({
          audioFormat: 1,
          channels: 1,
          sampleRate: 24000,
          bitsPerSample: 16,
        }),
      );
      expect(info?.durationMs).toBe(500);
    });

    it('skips a LIST chunk before data', () => {
      const fmt = Buffer.alloc(24);
      fmt.write('fmt ', 0, 'ascii');
      fmt.writeUInt32LE(16, 4);
      fmt.writeUInt16LE(1, 8);
      fmt.writeUInt16LE(1, 10);
      fmt.writeUInt32LE(24000, 12);
      fmt.writeUInt32LE(48000, 16);
      fmt.writeUInt16LE(2, 20);
      fmt.writeUInt16LE(16, 22);
      const list = Buffer.concat([
        Buffer.from('LIST'),
        Buffer.from([3, 0, 0, 0]),
        Buffer.from([1, 2, 3, 0]),
      ]);
      const data = Buffer.concat([
        Buffer.from('data'),
        Buffer.from([0x80, 0xbb, 0, 0]),
        Buffer.alloc(48000),
      ]);
      const body = Buffer.concat([Buffer.from('WAVE'), fmt, list, data]);
      const header = Buffer.alloc(8);
      header.write('RIFF', 0, 'ascii');
      header.writeUInt32LE(body.length, 4);
      expect(readPcmWavInfo(Buffer.concat([header, body]))?.durationMs).toBe(1000);
    });

    it.each([Buffer.alloc(0), Buffer.from('RIFF....WAVX'), Buffer.from('not a wav at all')])(
      'returns null for non-WAV input',
      (input) => {
        expect(readPcmWavInfo(input)).toBeNull();
      },
    );
  });

  describe('detectAudioContainer', () => {
    const pad = (head: Buffer): Buffer => Buffer.concat([head, Buffer.alloc(32)]);
    const ascii = (text: string, at = 0): Buffer => {
      const buffer = Buffer.alloc(at + text.length);
      buffer.write(text, at, 'latin1');
      return buffer;
    };

    it.each([
      ['WAV (RIFF....WAVE)', Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'), 'wav', 'wav'],
      ['MP3 with an ID3 tag', pad(ascii('ID3')), 'mp3', 'mp3'],
      ['MP3 with a bare frame sync', pad(Buffer.from([0xff, 0xfb, 0x90, 0x00])), 'mp3', 'mp3'],
      [
        'M4A/MP4 (ftyp at byte 4)',
        pad(Buffer.concat([Buffer.alloc(4), ascii('ftypM4A ')])),
        'm4a',
        'mov',
      ],
      ['Ogg', pad(ascii('OggS')), 'ogg', 'ogg'],
      ['WebM/Matroska', pad(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), 'webm', 'matroska'],
      ['FLAC', pad(ascii('fLaC')), 'flac', 'flac'],
    ])('recognises %s', (_name, bytes, ext, ffmpegFormat) => {
      expect(detectAudioContainer(bytes)).toEqual({ ext, ffmpegFormat });
    });

    it.each([
      ['an HLS playlist', Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\nhttp://169.254.169.254/\n')],
      ['an ffconcat script', Buffer.from("ffconcat version 1.0\nfile '/etc/passwd'\n")],
      ['a text file', Buffer.from('this is not audio at all')],
      ['RIFF that is not WAVE (AVI)', Buffer.from('RIFF\x24\x00\x00\x00AVI LIST', 'latin1')],
      ['a PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0])],
      ['a buffer too short to identify', Buffer.from('RIFF')],
      ['an empty buffer', Buffer.alloc(0)],
    ])('rejects %s', (_name, bytes) => {
      expect(detectAudioContainer(bytes)).toBeNull();
    });
  });
});
