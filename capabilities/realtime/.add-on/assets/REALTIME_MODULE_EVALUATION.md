# Realtime module evaluation

## Decision and implementation

Nitro 3.0.260610-beta / H3 defineWebSocketHandler with CrossWS0.4.12 on its supported node-server adapter. Node24 supplies the HTTP upgrade lifecycle; CrossWS owns RFC6455 framing/native ping-pong and exposes reliable Node buffer accounting. No Socket.IO/custom protocol or new general server framework. CrossWS is a pinned direct dev dependency only for protocol fixture imports; runtime is Nitro-owned. SSE uses native Web Response/ReadableStream. Other deployment adapters must independently verify native buffer/ping capabilities; this evaluation proves Node24, not all Nitro targets. References: https://nitro.build/docs/websocket , installed Nitro docs/runtime and https://nodejs.org/docs/latest-v24.x/api/http.html .

## Cross-framework v1 contract

Realtime is an authenticated human-cookie server→client hint stream with both SSE and WebSocket adapters. Application authorization supplies 1–32 exact channels matching `^[a-z][a-z0-9._:/-]{0,127}$`; reference routes reject all query-string channel/token negotiation and derive the recipient channel from authenticated server context; no wildcard, query token, machine key or arbitrary logged-in channel access. Events match `^[a-z][a-z0-9._-]{0,127}$`; Zod output must be JSON-safe. Each publication generates UUID and UTC ISO `occurredAt`, with `{id,type,occurredAt,data}` serialized once, at most 65,536 UTF-8 bytes. No replay, history, exactly-once or guaranteed delivery.

`REALTIME_TRANSPORTS` defaults to `sse`; normalized `sse`, `websocket`, `sse,websocket` select adapters, rejecting duplicates/unknown values. SSE uses `text/event-stream`, `Cache-Control: no-cache`, `event: <type>` and `data: <complete JSON envelope>`; never an SSE `id:` field. Transport comments include an initial connected comment and a heartbeat every 20 seconds. WebSocket sends that same JSON envelope and uses native ping/pong every 20 seconds, terminating a peer that misses the next heartbeat. Client application messages are closed; no RPC protocol.

Each connection has a 262,144-byte pending encoded-output ceiling. SSE uses a byte-length stream strategy, including its wire framing/control comments; Node WebSocket reserves frame overhead against native `bufferedAmount` before sending. Stalled connections close, with timers/listeners/queues/resources cleaned on abort/cancel/close. Reconnect and refetch authoritative state when continuity matters. Core process fanout needs no infrastructure. Optional application-owned Cache pub/sub uses one cache path, has no persistence, can lose outage messages, and requires explicit subscription recreation. Independent assets import no Cache.

Safe errors: configuration, invalid-input, unauthorized, unavailable, closed, backpressure. Optional telemetry may use transport, registered finite event type, operation, outcome, duration and numeric active count only: never event data/session/email/token/channel metric labels. Reference routes authenticate via Better Auth before opening event flow and derive a hashed stable user-ID channel. No Organizations/Authorization policy capability is added.

## Boundaries and limitations

Close clients; remove server/routes/api/realtime, optional app Cache wrapper, source/runtime scripts and nitro websocket configuration when unused. No external data deletion.

This prompt is the source of truth. No other framework repository was inspected, queried, polled or consulted. Framework-native routes/session handling, Drizzle executors and pg-boss mechanisms implement the shared behavior; no Organizations, Authorization or Feature Flags work is included.

## Verification

See reusable clean fixture plus targeted root tests. Hosted CI and final commit are supplied in the handoff, not retained as a rolling diary.

The reference application shares its process-local hub between the Nitro and TanStack Start module runners. The Nitro Node preset also performs its own 30-second idle sweep; the capability still owns the specified 20-second native ping/pong heartbeat. SSE reserves space for the Node adapter’s two native output chunks within the 262144-byte connection budget.
