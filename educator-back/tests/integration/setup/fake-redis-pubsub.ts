import { EventEmitter } from 'events';

type Payload = string | Buffer;

const toBuffer = (value: Payload): Buffer => Buffer.from(value);
const flatten = (channels: Array<string | string[]>): string[] => channels.flat();
const globToRegExp = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

/**
 * In-process stand-in for the slice of ioredis that `@socket.io/redis-adapter` (ioredis flavour)
 * uses: `duplicate`, `publish`, `(p)subscribe`/`(p)unsubscribe`, `messageBuffer`/`pmessageBuffer`
 * events, `ping`, `quit`, `disconnect`. Every client created via `duplicate()` joins the same bus,
 * so a publish on one replica's connection reaches the subscriptions of the others.
 */
export class FakeRedisPubSub extends EventEmitter {
  status = 'ready';
  /** Connections handed out by `duplicate()` — what the adapter holds open. */
  readonly duplicates: FakeRedisPubSub[] = [];

  private readonly channels = new Set<string>();
  private readonly patterns = new Set<string>();

  constructor(private readonly bus: Set<FakeRedisPubSub> = new Set()) {
    super();
    this.bus.add(this);
  }

  duplicate(): FakeRedisPubSub {
    const copy = new FakeRedisPubSub(this.bus);
    this.duplicates.push(copy);
    return copy;
  }

  subscribe(...channels: Array<string | string[]>): Promise<number> {
    flatten(channels).forEach((channel) => this.channels.add(channel));
    return Promise.resolve(this.channels.size);
  }

  unsubscribe(...channels: Array<string | string[]>): Promise<number> {
    flatten(channels).forEach((channel) => this.channels.delete(channel));
    return Promise.resolve(this.channels.size);
  }

  psubscribe(...patterns: Array<string | string[]>): Promise<number> {
    flatten(patterns).forEach((pattern) => this.patterns.add(pattern));
    return Promise.resolve(this.patterns.size);
  }

  punsubscribe(...patterns: Array<string | string[]>): Promise<number> {
    flatten(patterns).forEach((pattern) => this.patterns.delete(pattern));
    return Promise.resolve(this.patterns.size);
  }

  /** Delivers asynchronously (like a network hop) to every live subscriber, publisher included. */
  publish(channel: string, message: Payload): Promise<number> {
    let receivers = 0;
    for (const client of this.bus) {
      if (client.status === 'end') continue;
      if (client.channels.has(channel)) {
        receivers++;
        setImmediate(() =>
          client.emit('messageBuffer', toBuffer(channel), toBuffer(message)),
        );
      }
      for (const pattern of client.patterns) {
        if (!globToRegExp(pattern).test(channel)) continue;
        receivers++;
        setImmediate(() =>
          client.emit('pmessageBuffer', toBuffer(pattern), toBuffer(channel), toBuffer(message)),
        );
      }
    }
    return Promise.resolve(receivers);
  }

  ping(): Promise<string> {
    return Promise.resolve('PONG');
  }

  quit(): Promise<string> {
    this.disconnect();
    return Promise.resolve('OK');
  }

  disconnect(): void {
    this.status = 'end';
    this.bus.delete(this);
  }
}
