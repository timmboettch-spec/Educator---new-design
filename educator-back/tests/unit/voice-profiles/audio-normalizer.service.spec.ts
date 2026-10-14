import { EventEmitter } from 'events';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import { HttpException } from '@nestjs/common';
import { VoiceProfileConstants } from 'src/common/constants';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { LoggerService } from 'src/common/services/logger.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require('child_process') as { spawn: jest.Mock };

/** What the fake child does for one invocation. */
interface FakeRun {
  code?: number;
  stdout?: string;
  stderr?: string;
  /** Write this file to the last argument (the transcode output path). */
  output?: Buffer;
  /** Never exit on its own; only an abort ends it. */
  hang?: boolean;
  /** Fail to spawn, as a missing binary does. */
  enoent?: boolean;
}

interface SpawnCall {
  command: string;
  args: string[];
  options: { signal?: AbortSignal; killSignal?: string };
  killedWith?: string;
}

const FIXTURE_WAV = readFileSync(join(__dirname, 'fixtures', 'tone-24k-pcm16.wav'));

/** Smallest input the container sniff accepts; the spawn double never decodes it. */
const WAV_BYTES = Buffer.concat([
  Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'),
  Buffer.alloc(32),
]);

const probe = (duration: number): FakeRun => ({
  stdout: JSON.stringify({ format: { duration: String(duration) } }),
});
const analysis = (stderr = 'n_samples: 1000\nmax_volume: -12.0 dB\n'): FakeRun => ({ stderr });
const transcode = (): FakeRun => ({ output: FIXTURE_WAV });

describe('AudioNormalizerService (spawn mocked)', () => {
  let service: AudioNormalizerService;
  let runs: FakeRun[];
  let calls: SpawnCall[];
  const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() } as unknown as LoggerService;

  beforeEach(() => {
    service = new AudioNormalizerService(logger);
    runs = [];
    calls = [];
    spawn.mockReset();
    spawn.mockImplementation(
      (command: string, args: string[], options: SpawnCall['options']): EventEmitter => {
        const call: SpawnCall = { command, args, options };
        calls.push(call);
        const run = runs.shift() ?? {};
        const child = Object.assign(new EventEmitter(), {
          stdout: new PassThrough(),
          stderr: new PassThrough(),
        });
        const abort = (): void => {
          call.killedWith = options.killSignal;
          child.emit('error', Object.assign(new Error('aborted'), { name: 'AbortError' }));
          child.emit('close', null);
        };
        setImmediate(() => {
          if (run.enoent) {
            child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
            return;
          }
          if (options.signal?.aborted) return abort();
          options.signal?.addEventListener('abort', abort, { once: true });
          if (run.hang) return;
          if (run.output) writeFileSync(args[args.length - 1], run.output);
          child.stdout.end(run.stdout ?? '');
          child.stderr.end(run.stderr ?? '');
          setImmediate(() => child.emit('close', run.code ?? 0));
        });
        return child;
      },
    );
  });

  const expect400 = async (promise: Promise<unknown>, key: string): Promise<void> => {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect(JSON.stringify((error as HttpException).getResponse())).toContain(key);
  };

  it('runs ffprobe, one analysis pass, then the transcode — and returns the WAV and its duration', async () => {
    runs = [probe(8), analysis(), transcode()];

    const result = await service.normalizeVoiceReference(WAV_BYTES);

    expect(result.durationMs).toBe(500);
    expect(result.buffer.equals(FIXTURE_WAV)).toBe(true);
    expect(calls.map((c) => c.command)).toEqual(['ffprobe', 'ffmpeg', 'ffmpeg']);
    expect(calls[0].args).toEqual(
      expect.arrayContaining(['-show_entries', 'format=duration', '-of', 'json']),
    );
    expect(calls[1].args).toEqual(
      expect.arrayContaining(['-af', 'silencedetect=noise=-50dB:d=0.5,volumedetect', '-f', 'null']),
    );
    for (const call of calls) {
      expect(call.options.killSignal).toBe('SIGKILL');
      expect(call.options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('builds the normalisation command: mono first, trims both ends, loudnorm -20, 24 kHz s16, 10 s', () => {
    const args = AudioNormalizerService.buildTranscodeArgs('/in', '/out.wav', 'wav');
    const filter = args[args.indexOf('-af') + 1];
    expect(filter.split(',')).toEqual([
      'aformat=channel_layouts=mono',
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1',
      'areverse',
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1',
      'areverse',
      'loudnorm=I=-20:TP=-1.5:LRA=11',
      'aresample=24000',
    ]);
    expect(args).toEqual(
      expect.arrayContaining(['-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-t', '10']),
    );
    expect(args[args.length - 1]).toBe('/out.wav');
    expect(args[args.indexOf('-i') + 1]).toBe('/in');
  });

  it('pins the demuxer and local-files-only BEFORE the input in the transcode command', () => {
    const args = AudioNormalizerService.buildTranscodeArgs('/in.m4a', '/out.wav', 'mov');
    expect(args.slice(args.indexOf('-protocol_whitelist'), args.indexOf('-i'))).toEqual([
      '-protocol_whitelist',
      'file',
      '-f',
      'mov',
    ]);
  });

  describe('container sniffing and ffmpeg hardening', () => {
    const header = (kind: string): Buffer => {
      const body = Buffer.alloc(40);
      switch (kind) {
        case 'wav':
          return Buffer.concat([Buffer.from('RIFF\x24\x00\x00\x00WAVE', 'latin1'), body]);
        case 'mp3':
          return Buffer.concat([Buffer.from('ID3', 'latin1'), body]);
        case 'm4a':
          return Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'latin1'), body]);
        case 'ogg':
          return Buffer.concat([Buffer.from('OggS', 'latin1'), body]);
        case 'webm':
          return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), body]);
        default:
          return Buffer.concat([Buffer.from('fLaC', 'latin1'), body]);
      }
    };

    it.each([
      ['wav', 'wav'],
      ['mp3', 'mp3'],
      ['m4a', 'mov'],
      ['ogg', 'ogg'],
      ['webm', 'matroska'],
      ['flac', 'flac'],
    ])(
      'a %s upload runs all three commands with -protocol_whitelist file -f %s before the input',
      async (kind, format) => {
        runs = [probe(8), analysis(), transcode()];

        await service.normalizeVoiceReference(header(kind));

        expect(calls.map((c) => c.command)).toEqual(['ffprobe', 'ffmpeg', 'ffmpeg']);
        for (const call of calls) {
          const at = call.args.indexOf('-protocol_whitelist');
          expect(call.args.slice(at, at + 4)).toEqual([
            '-protocol_whitelist',
            'file',
            '-f',
            format,
          ]);
          const inputIndex = call.args.findIndex((arg) => arg.includes(`input.${kind}`));
          expect(inputIndex).toBeGreaterThan(at + 3);
          // ffmpeg reads it via -i; ffprobe takes the path as its last argument
          if (call.command === 'ffmpeg') expect(call.args[inputIndex - 1]).toBe('-i');
          else expect(inputIndex).toBe(call.args.length - 1);
        }
      },
    );

    it('rejects an #EXTM3U playlist as undecodable without writing a file or spawning anything', async () => {
      const playlist = Buffer.from(
        '#EXTM3U\n#EXTINF:10,\nhttp://169.254.169.254/latest/meta-data/\n',
      );
      await expect400(service.normalizeVoiceReference(playlist), 'UNDECODABLE');
      expect(calls).toHaveLength(0);
    });

    it('rejects non-audio bytes whatever mimetype the upload claimed (only the bytes are consulted)', async () => {
      const spoofed = {
        buffer: Buffer.from('MZ\x90\x00 not audio, mimetype says audio/wav'),
        mimetype: 'audio/wav',
      };
      await expect400(service.normalizeVoiceReference(spoofed.buffer), 'UNDECODABLE');
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects an undecodable file (ffprobe fails)', async () => {
    runs = [{ code: 1, stdout: '{\n\n}' }];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'UNDECODABLE');
    expect(calls).toHaveLength(1);
  });

  it('rejects a recording shorter than 5 s', async () => {
    runs = [probe(2)];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'TOO_SHORT');
  });

  it('rejects a recording longer than 30 s', async () => {
    runs = [probe(31)];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'TOO_LONG');
  });

  it('rejects a recording that is more than 50% silence', async () => {
    runs = [probe(8), analysis('silence_start: 0\nsilence_end: 5 | silence_duration: 5\n')];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'TOO_SILENT');
  });

  it('accepts exactly 50% silence', async () => {
    runs = [
      probe(8),
      analysis('silence_start: 0\nsilence_end: 4 | silence_duration: 4\n'),
      transcode(),
    ];
    await expect(service.normalizeVoiceReference(WAV_BYTES)).resolves.toBeDefined();
  });

  it('rejects clipping: max_volume at 0 dB and more than 1% of samples in the 0 dB bin', async () => {
    runs = [probe(8), analysis('n_samples: 1000\nmax_volume: 0.0 dB\nhistogram_0db: 50\n')];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'CLIPPED');
  });

  it('rejects clipping when ffmpeg 8 prints an empty volumedetect block (n_samples: 0) first', async () => {
    runs = [
      probe(8),
      analysis(
        [
          '[Parsed_volumedetect_1 @ 0x6000] n_samples: 0',
          '[Parsed_volumedetect_1 @ 0x6000] n_samples: 1000',
          '[Parsed_volumedetect_1 @ 0x6000] max_volume: 0.0 dB',
          '[Parsed_volumedetect_1 @ 0x6000] histogram_0db: 50',
          '',
        ].join('\n'),
      ),
    ];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'CLIPPED');
  });

  it('accepts a peak at 0 dB when only a few samples reach it', async () => {
    runs = [
      probe(8),
      analysis('n_samples: 1000\nmax_volume: 0.0 dB\nhistogram_0db: 5\n'),
      transcode(),
    ];
    await expect(service.normalizeVoiceReference(WAV_BYTES)).resolves.toBeDefined();
  });

  it('rejects when the transcode fails', async () => {
    runs = [probe(8), analysis(), { code: 1 }];
    await expect400(service.normalizeVoiceReference(WAV_BYTES), 'UNDECODABLE');
  });

  it('maps a missing ffmpeg/ffprobe binary to 503', async () => {
    runs = [{ enoent: true }];
    const error = await service.normalizeVoiceReference(WAV_BYTES).catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(503);
  });

  describe('deadline', () => {
    const audio = VoiceProfileConstants.AUDIO as { PROCESS_TIMEOUT_MS: number };
    const original = audio.PROCESS_TIMEOUT_MS;
    afterEach(() => {
      audio.PROCESS_TIMEOUT_MS = original;
    });

    it('kills the running process with SIGKILL and answers 400 when the deadline passes', async () => {
      audio.PROCESS_TIMEOUT_MS = 50;
      runs = [probe(8), { hang: true }];

      await expect400(service.normalizeVoiceReference(WAV_BYTES), 'PROCESSING_TIMEOUT');
      expect(calls[1].killedWith).toBe('SIGKILL');
    });
  });

  it('kills the running process when the caller aborts', async () => {
    const controller = new AbortController();
    runs = [{ hang: true }];
    const promise = service.normalizeVoiceReference(WAV_BYTES, controller.signal);
    setTimeout(() => controller.abort(), 20);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls[0].killedWith).toBe('SIGKILL');
  });
});
