# ADR-0008: Cross-replica Socket.IO via Redis pub/sub, per-recipient rooms, WebSocket-only transport

## Status

Accepted. Spec: [`docs/REDIS-SOCKETIO-ADAPTER-SPEC.md`](../REDIS-SOCKETIO-ADAPTER-SPEC.md).

## Context

Prod runs 1–8 replicas in ACA `activeRevisionsMode: 'Multiple'` (blue/green). Notification routing kept socket ids in per-process Maps, so a push emitted on one replica never reached a socket held by another. ACA session affinity would make long-polling work, but it is supported only in single-revision mode, and adopting it means giving up blue/green.

## Decision

- Use `@socket.io/redis-adapter` (classic pub/sub) on the existing Redis, rather than the streams adapter. Real-time delivery is best-effort: Postgres holds every notification, and missed pushes are recovered by the client refetching.
- Address recipients by **recipient room** (`educator:<id>`, `admin:<id>`, `student:<code>`), never by socket id. As a result, every tab of a recipient receives every event.
- Clients use WebSocket-only transport instead of sticky sessions, which keeps multiple-revision blue/green deploys.

## Consequences

- Events published while a replica is disconnected from Redis, or during a deploy's reconnect window, are lost (no replay).
- Crons that emit now reach all users from every replica, so duplicate execution needs a leader lock (separate ticket).
- A kill-switch (`SOCKET_IO_REDIS_ADAPTER_ENABLED`) reverts to the in-memory adapter.
- Any future client must not rely on HTTP long-polling.
