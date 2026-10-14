import { INestApplicationContext, LoggerService } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';
import { duplicateRedisClient } from 'src/redis/redis.provider';
import { SocketIoConstants } from '../constants';

/**
 * Socket.IO adapter that shares room broadcasts between replicas over Redis pub/sub
 * (ADR-0008). Uses two dedicated connections duplicated from the base Redis client, so a
 * pub/sub outage never touches the base client and recovery is ioredis's own reconnect.
 */
export class SocketIoAdapter extends IoAdapter {
    private readonly pubClient: Redis;
    private readonly subClient: Redis;
    private readonly adapterConstructor: ReturnType<typeof createAdapter>;

    constructor(app: INestApplicationContext, redis: Redis, logger: LoggerService) {
        super(app);
        this.pubClient = duplicateRedisClient(redis, logger);
        this.subClient = duplicateRedisClient(redis, logger);
        this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    }

    createIOServer(port: number, options?: Partial<ServerOptions>): Server {
        const server = super.createIOServer(port, options) as Server;
        server.adapter(this.adapterConstructor);
        return server;
    }

    async close(server: Parameters<IoAdapter['close']>[0]): Promise<void> {
        await super.close(server);
        await this.closeRedis();
    }

    async dispose(): Promise<void> {
        await super.dispose();
        await this.closeRedis();
    }

    // The adapter fires its unsubscribes without awaiting them, so closing straight away would
    // reject them with "Connection is closed". A PING queues behind them (and behind subscribes
    // still waiting on a connect), so once it answers the clients are idle and safe to QUIT.
    // Bounded, so an unreachable Redis can't hold shutdown open. Idempotent.
    private async closeRedis(): Promise<void> {
        const clients = [this.pubClient, this.subClient].filter((client) => client.status !== 'end');
        await this.settleWithin(clients.map((client) => client.ping()));
        await this.settleWithin(clients.map((client) => client.quit()));
        clients.forEach((client) => client.disconnect());
    }

    private async settleWithin(commands: Promise<unknown>[]): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, SocketIoConstants.CLOSE_DRAIN_TIMEOUT_MS);
        });
        await Promise.race([Promise.allSettled(commands), timeout]);
        clearTimeout(timer);
    }
}
