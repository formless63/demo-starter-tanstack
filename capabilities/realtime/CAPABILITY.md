# Realtime capability

Status: done. `defaultInstalled: false`; reference application explicitly enables this independent capability.

## Contract

Realtime is an authenticated human-cookie server→client hint stream with both SSE and WebSocket adapters. Application authorization supplies 1–32 exact channels matching `^[a-z][a-z0-9._:/-]{0,127}$`; reference routes reject all query-string channel/token negotiation and derive the recipient channel from authenticated server context; no wildcard, query token, machine key or arbitrary logged-in channel access. Events match `^[a-z][a-z0-9._-]{0,127}$`; Zod output must be JSON-safe. Each publication generates UUID and UTC ISO `occurredAt`, with `{id,type,occurredAt,data}` serialized once, at most 65,536 UTF-8 bytes. No replay, history, exactly-once or guaranteed delivery.

`REALTIME_TRANSPORTS` defaults to `sse`; normalized `sse`, `websocket`, `sse,websocket` select adapters, rejecting duplicates/unknown values. SSE uses `text/event-stream`, `Cache-Control: no-cache`, `event: <type>` and `data: <complete JSON envelope>`; never an SSE `id:` field. Transport comments include an initial connected comment and a heartbeat every 20 seconds. WebSocket sends that same JSON envelope and uses native ping/pong every 20 seconds, terminating a peer that misses the next heartbeat. Client application messages are closed; no RPC protocol.

Each connection has a 262,144-byte pending encoded-output ceiling. SSE uses a byte-length stream strategy, including its wire framing/control comments; Node WebSocket reserves frame overhead against native `bufferedAmount` before sending. Stalled connections close, with timers/listeners/queues/resources cleaned on abort/cancel/close. Reconnect and refetch authoritative state when continuity matters. Core process fanout needs no infrastructure. Optional application-owned Cache pub/sub uses one cache path, has no persistence, can lose outage messages, and requires explicit subscription recreation. Independent assets import no Cache.

Safe errors: configuration, invalid-input, unauthorized, unavailable, closed, backpressure. Optional telemetry may use transport, registered finite event type, operation, outcome, duration and numeric active count only: never event data/session/email/token/channel metric labels. Reference routes authenticate via Better Auth before opening event flow and derive a hashed stable user-ID channel. No Organizations/Authorization policy capability is added.

## Installation and runtime

Select through official retained `capabilities/realtime/add-on.json`; compiler uses `bun run add-ons:compile realtime`, lifecycle uses `bun run add-ons:test realtime`. Configure Nitro features.websocket and choose SSE/WebSocket/both. Packaged reference routes default to a deny-all application authorizer; replace it with your existing human session and channel policy. No authentication library is installed by this add-on.

Scripts: `realtime:unit`, `realtime:transport`.

No migration or runtime service. Optional Cache wrapper is application-owned. Both route adapters close resources on transport termination.

## Removal and upgrade

Close clients; remove server/routes/api/realtime, optional app Cache wrapper, source/runtime scripts and nitro websocket configuration when unused. No external data deletion.

Contract version1 changes require reviewing payload privacy, delivery/transaction semantics, wire bounds and retained consumer assets. No remote service migration is automatic.

## Verification and agent guidance

Targeted contract tests, clean install/build/removal, actual Node transports or PostgreSQL/Jobs and ntfy fixtures; generic CI matrix discovers this workspace when marked done. Follow `.agents/skills/realtime-change/SKILL.md` and `capability-change`. Evaluation: `REALTIME_MODULE_EVALUATION.md`.
