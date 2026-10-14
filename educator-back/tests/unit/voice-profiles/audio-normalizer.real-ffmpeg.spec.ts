import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HttpException } from '@nestjs/common';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { LoggerService } from 'src/common/services/logger.service';
import { readPcmWavInfo } from 'src/common/utils/audio-analysis.util';

/**
 * Runs the real ffmpeg/ffprobe — only where both are on PATH (CI images and the
 * runtime Docker image have them; a bare laptop may not). Inputs are generated
 * with ffmpeg's lavfi sources, using only options that exist in ffmpeg 4.x.
 */
const hasFfmpeg =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const describeIfFfmpeg = hasFfmpeg ? describe : describe.skip;

describeIfFfmpeg('AudioNormalizerService (real ffmpeg)', () => {
  let dir: string;
  const service = new AudioNormalizerService({
    error: jest.fn(),
    log: jest.fn(),
  } as unknown as LoggerService);

  const generate = (name: string, args: string[]): Buffer => {
    const path = join(dir, name);
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, path]);
    if (result.status !== 0) throw new Error(`ffmpeg failed: ${String(result.stderr)}`);
    return readFileSync(path);
  };

  const statusOf = async (input: Buffer): Promise<{ status: number; body: string }> => {
    const error = await service.normalizeVoiceReference(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    return {
      status: (error as HttpException).getStatus(),
      body: JSON.stringify((error as HttpException).getResponse()),
    };
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'voice-normalizer-spec-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts an ~8 s stereo 44.1 kHz tone with silent ends → 24 kHz mono s16, trimmed, ≤ 10 s', async () => {
    const input = generate('tone.wav', [
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:r=44100:d=8',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-filter_complex',
      '[0]atrim=duration=1[a];[2]atrim=duration=1.5[c];' +
        '[1]aformat=channel_layouts=stereo,volume=0.3[t];[a][t][c]concat=n=3:v=0:a=1',
    ]);

    const result = await service.normalizeVoiceReference(input);
    const info = readPcmWavInfo(result.buffer);

    expect(info).toEqual(
      expect.objectContaining({
        audioFormat: 1,
        channels: 1,
        sampleRate: 24000,
        bitsPerSample: 16,
      }),
    );
    expect(result.durationMs).toBe(info?.durationMs);
    // 10.5 s in, 2.5 s of silent ends trimmed (keeping ~0.1 s at each end).
    expect(result.durationMs).toBeGreaterThan(7500);
    expect(result.durationMs).toBeLessThanOrEqual(10000);
  });

  it('cuts a 25 s recording to 10 s', async () => {
    const input = generate('long.wav', ['-f', 'lavfi', '-i', 'sine=f=300:r=48000:d=25']);
    const result = await service.normalizeVoiceReference(input);
    expect(result.durationMs).toBe(10000);
  });

  it('rejects a 2 s recording as too short', async () => {
    const input = generate('short.wav', ['-f', 'lavfi', '-i', 'sine=f=440:r=16000:d=2']);
    const { status, body } = await statusOf(input);
    expect(status).toBe(400);
    expect(body).toContain('TOO_SHORT');
  });

  it('rejects 8 s of silence', async () => {
    const input = generate('silent.wav', [
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=16000:cl=mono',
      '-t',
      '8',
    ]);
    const { status, body } = await statusOf(input);
    expect(status).toBe(400);
    expect(body).toContain('TOO_SILENT');
  });

  it('rejects a hard-clipped recording', async () => {
    const input = generate('clipped.wav', [
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:r=16000:d=8,volume=20',
    ]);
    const { status, body } = await statusOf(input);
    expect(status).toBe(400);
    expect(body).toContain('CLIPPED');
  });

  const encoders = hasFfmpeg
    ? String(spawnSync('ffmpeg', ['-hide_banner', '-encoders']).stdout)
    : '';
  it.each([
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['ogg', 'libvorbis'],
    ['flac', 'flac'],
    ['webm', 'libopus'],
  ])('decodes a real %s upload through the pinned demuxer', async (ext, encoder) => {
    if (!encoders.includes(encoder)) return; // this ffmpeg build lacks the encoder
    const input = generate(`tone.${ext}`, [
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:r=48000:d=8',
      '-c:a',
      encoder,
    ]);
    const result = await service.normalizeVoiceReference(input);
    expect(readPcmWavInfo(result.buffer)).toEqual(
      expect.objectContaining({ channels: 1, sampleRate: 24000, bitsPerSample: 16 }),
    );
    expect(result.durationMs).toBeGreaterThan(7000);
  });

  it('rejects an #EXTM3U playlist that points at a real local audio file', async () => {
    const wav = generate('target.wav', ['-f', 'lavfi', '-i', 'sine=f=440:r=16000:d=8']);
    expect(wav.length).toBeGreaterThan(0);
    const playlist = Buffer.from(`#EXTM3U\n#EXTINF:8,\n${join(dir, 'target.wav')}\n`);
    const { status, body } = await statusOf(playlist);
    expect(status).toBe(400);
    expect(body).toContain('UNDECODABLE');
  });

  it('rejects bytes that are not audio', async () => {
    const { status, body } = await statusOf(Buffer.from('definitely not an audio file'.repeat(50)));
    expect(status).toBe(400);
    expect(body).toContain('UNDECODABLE');
  });
});
