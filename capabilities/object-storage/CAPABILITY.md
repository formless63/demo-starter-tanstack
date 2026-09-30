# Object Storage capability

Status: done; optional (`defaultInstalled: false`). Enabled in the reference application for continuous verification. Evaluation: `OBJECT_STORAGE_MODULE_EVALUATION.md`. Root application enablement is separate from consumer defaults.

## Requirements

**Requires:** No reusable capability, PostgreSQL, Drizzle, or authentication. A Node-compatible server runtime is needed. Official add-on `dependsOn: []` is accurate: S3 needs no additional TanStack integration.

**Integrates with:** Jobs and Observability, optionally. Future application workflows can compose background cleanup, processing, or replication; none are implemented here.

**External:** S3-compatible storage when actively used. Tested targets: RustFS 1.0.0 (preferred self-hosted) and Garage 2.4.1. AWS portability is SDK/protocol/configuration based, not live-AWS verification. No universal S3 compatibility claim.

## Adds

### Dependencies

`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, both pinned 3.1143.0. No lib-storage is necessary for the explicit multipart primitives. No MinIO, database, auth, Jobs, or telemetry SDK dependency.

### Environment

Configuration is lazy; importing/building unrelated routes needs no storage configuration or service.

### Shared cross-framework defaults

The TanStack and Nuxt starters share observable configuration/behavior, not identical source code: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` 3.1143.0; preferred RustFS 1.0.0; alternate tested Garage 2.4.1; optional third-party Noooste Garage UI v0.13.0. Objects are private by default. Presigning uses GET + PUT, defaults to 600 seconds and accepts only 30–3600 seconds. A custom endpoint defaults to `forcePathStyle: true`; no custom endpoint retains normal AWS addressing. Credentials are either a complete explicit pair or the normal AWS SDK credential chain.

Region resolution is strictly `STORAGE_REGION` → `AWS_REGION` → `AWS_DEFAULT_REGION` → configuration error. There is no implicit `us-east-1` fallback: region is explicit deployment configuration, and AWS deployments must not silently target a guessed region. Local helpers explicitly select `garage` for Garage and `us-east-1` for the RustFS development fixture; these helper values are not application defaults.

| Variable | Semantics |
| --- | --- |
| `STORAGE_BUCKET` | Required when used; one operator-selected bucket, not browser input |
| `STORAGE_REGION` | Falls back to `AWS_REGION`, then `AWS_DEFAULT_REGION`; required when used |
| `STORAGE_ENDPOINT` | Optional HTTP(S) origin; absent uses normal AWS endpoint resolution; credentials/query/path rejected |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Optional complete pair; partial pair fails safely |
| `STORAGE_SESSION_TOKEN` | Optional token with the explicit pair; normal `AWS_*` temporary credentials remain supported through the SDK chain |
| `STORAGE_FORCE_PATH_STYLE` | `true`/`false`; defaults true for custom endpoint, false for AWS |
| `STORAGE_PRESIGN_TTL_SECONDS` | Default 600; integer 30–3600; per-call override has the same bounds |
| `STORAGE_KEY_PREFIX` | Optional normalized namespace prefix; enforced on operations |

Without the explicit pair the SDK uses its normal credential provider chain, including AWS environment/shared configuration, IAM roles, container and instance credentials. Credentials/client stay on the server. Do not log full endpoint URLs, errors/causes, credentials, or presigned URLs.

### Scripts

`storage:unit`, `storage:check`, `storage:smoke`, `storage:bootstrap`, `storage:compat`, `storage:dev:rustfs`, `storage:dev:garage`, `storage:dev:down`. The root-only `storage:reference:smoke` demonstrates optional telemetry; independent assets omit it. Generic add-on compiler/test/matrix are unchanged.

### Database/migrations

None. No file tables, attachment records, upload-intent persistence, or hidden schema mutation.

### Runtime processes

Inside the existing server process. `checkStorage()` performs non-mutating HEAD bucket; it is not automatically a global readiness dependency. `close()` releases client resources for scripts. SDK connection timeout is 3 seconds, request timeout 15 seconds, max three attempts; streaming transfer lifecycle belongs to its consumer.

### Compose/infrastructure

`compose.storage.yaml` is separate from default Compose. `rustfs`, `garage`, and optional `garage-ui` profiles use pinned images and named storage volumes. RustFS runs as upstream's UID 10001. Garage uses official single-node/default-bucket bootstrap flags to configure layout/key/bucket deterministically; provider administration never enters the common API. These single-node examples have no redundancy and are development-only. Known non-default development credentials/admin/RPC tokens must never be reused in production.

The shared optional Garage UI recommendation across the TanStack and Nuxt starters is third-party [Noooste/garage-ui](https://github.com/Noooste/garage-ui), `noooste/garage-ui:v0.13.0`, not official Garage software. It is operator/development convenience only, not needed for S3 operation. It holds the privileged full Garage admin token server/operator-side and enables token login; local login uses the documented development admin token from `infrastructure/storage/garage.toml`. UI/admin/S3 ports bind loopback by default. Never reuse known development credentials outside local development or expose the admin token to application/browser configuration.

## Application API

Server-only `src/integrations/storage/storage.server.ts` exports `getStorage()`, `getS3Client()`, `checkStorage()`, `createStorage(config, optionalHook)`. The returned API provides `putObject`, streaming `getObject`, `headObject`, `deleteObject`, prefix/paginated `listObjects`, `presignUpload`, `presignDownload`, `createMultipartUpload`, `presignMultipartPart`, `completeMultipartUpload`, `abortMultipartUpload`, `verifyUploadedObject`, `createKey`, and `close`.

```ts
const storage = getStorage()
const key = storage.createKey('documents') // optional prefix/namespace/random UUID
await storage.putObject(key, nodeStream, { contentType: 'application/pdf', contentLength })
const { body } = await storage.getObject(key)
if (!body) throw new Error('Missing body')
// Transfer to a destination with backpressure; pipeline consumes/destroys on failure.
await pipeline(body as Readable, destination)
```

The caller owns Body: consume it completely or destroy/cancel it, including when downstream processing fails. Never buffer arbitrary objects by default. Only the bounded test payloads use string/byte buffering. Unknown-length Node uploads may require an SDK-supported transfer encoding; prefer known Content-Length or explicit multipart for large/unknown streams.

Keys use conservative ASCII segments, max 1024 UTF-8 bytes. Leading slash, empty segments, dot/traversal, controls, backslashes and unsafe characters are rejected. Prefixes trim outer slashes; generated keys never include original filenames. Applications own authorization, namespaces, filename records, and reviewed metadata. No user/org model is baked in.

Metadata is limited to Content-Type, Cache-Control and up to 16 lowercase user metadata keys, each value at most 256 printable ASCII characters and total 2048 bytes. Reads expose only Content-Type/Length, ETag, LastModified, Cache-Control, metadata and Body. ETag is opaque, not a universal hash. No public ACL, tags, versioning, encryption or automatic public policy is part of v1. Raw-client escape-hatch use requires application review.

```ts
// Authorize + validate proposed type/size first, then choose key on the server.
const key = storage.createKey('uploads')
const upload = await storage.presignUpload(key, { contentType: 'text/plain', ttl: 600 })
// Browser must reproduce upload.headers exactly; never log upload.url.
// After upload, application checks actual object and can reject/delete it:
try { await storage.verifyUploadedObject(key, { maxBytes: 1_000_000, contentType: 'text/plain' }) }
catch (error) { await storage.deleteObject(key); throw error }
```

Presigned PUT/GET are the baseline, not POST. Content-Type is explicitly included in SignedHeaders and returned as a required upload header. A mismatched header fails real tests on both providers. Content-Type is an assertion, not proof of file contents. A PUT URL has no universal portable pre-ingest size policy; HEAD verification is post-upload and can race with replay/overwrite until URL expiry. Hard limits or atomic approval require an application-controlled endpoint/proven mechanism. No DB-backed upload intent is invented here. Treat signed URLs as replayable temporary bearer credentials with bounded TTL (actual lifetime may be shorter when signing credentials expire).

Multipart requires an opaque upload ID, part numbers 1–10000 and a non-empty ascending unique ETag list. Use at least 5 MiB for each non-final part for portability. Applications persist sessions if needed, retain returned part ETags, complete explicitly, and abort failed/abandoned sessions. No browser multipart UI or provider-specific workaround is included.

`StorageError` exposes safe code/message via `toJSON()` (`configuration`, `not_found`, `access_denied`, `unavailable`, `invalid_input`, `provider_error`); original cause remains server-only and must not be serialized/logged raw. Reusable code logs no URLs or inputs. Optional hooks receive only a finite operation name and callback, not key/bucket/credentials/results. Reference wrapper `src/lib/storage.server.ts` records `app.storage.*` count/duration/outcome without high-cardinality labels or raw errors.

## Installation

1. Compile with `bun run add-ons:compile object-storage`; install retained `capabilities/object-storage/add-on.json` through official CLI URL mechanics. No other add-on is pulled in and no shared application route/auth/schema is overlaid.
2. Configure an existing private bucket and least-privilege credentials/IAM externally. Leave storage unset until actually needed.
3. Local setup: `bun run storage:dev:rustfs` or `bun run storage:dev:garage` explicitly starts one service and prepares its development bucket and loopback-origin CORS. Defaults below match the helpers:

```dotenv
STORAGE_BUCKET=starter-storage
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=http://127.0.0.1:9000
STORAGE_ACCESS_KEY_ID=starter-storage-dev
STORAGE_SECRET_ACCESS_KEY=local-storage-only-not-for-production
```

For Garage use region `garage`, endpoint `http://127.0.0.1:3900`, access ID `GK0123456789abcdef0123456789abcdef`. Persist chosen configuration in ignored `.env.local`; helpers do not overwrite it. Override development values/ports with `STORAGE_DEV_BUCKET`, `STORAGE_DEV_ACCESS_KEY` (RustFS), `GARAGE_DEV_ACCESS_KEY`, `STORAGE_DEV_SECRET_KEY`, `RUSTFS_PORT`/`GARAGE_PORT`. Bootstrap accepts `STORAGE_DEV_APP_ORIGIN` (default `http://localhost:3000`, e.g. `http://127.0.0.1:3000`); browser origin must match exactly, no wildcard production recommendation.

4. Run `storage:check` and `storage:smoke`. `storage:compat` creates/removes its own unique disposable stacks and volumes and tests both providers; it never targets normal development volumes. Requires Docker/Compose, not real AWS.
5. Optional UI: `docker compose -f compose.storage.yaml --profile garage --profile garage-ui up -d garage garage-ui`; browse `http://localhost:3909`. Logs: `docker compose -f compose.storage.yaml --profile garage logs -f garage`. Stop with `storage:dev:down`, retaining volumes. Removing volumes is a separate destructive operator choice.
6. Root production Compose passes optional storage config without requiring storage. To use the local profile from an application container, merge both Compose files under one project/network and configure endpoint `http://rustfs:9000` or `http://garage:3900`, never container localhost. Such internal hostnames are not browser-accessible: direct browser presigning needs one externally reachable endpoint whose signed hostname is not rewritten. Production TLS/bucket policies/CORS/credentials are operator-owned.

## Removal

Delete `src/integrations/storage`, its owned scripts, `src/lib/storage.server.ts` and root reference smoke; remove `storage:*` scripts, both AWS packages if unused, storage env/Compose pass-through, `compose.storage.yaml` and `infrastructure/storage`, capability-specific main CI smoke, and reference enablement. Remove only owned telemetry test wiring. Do not delete remote buckets, objects, credentials, or retained local volumes. Keep reusable authoring source separately if useful; prune its directory/evaluation/skill and change catalog status to deferred only if abandoning authoring. Detailed sequence: `docs/STARTING-A-PROJECT.md#remove-object-storage`. CLI has no uninstall transaction.

Root Docker also bundles `.output/storage-check.mjs` and `.output/storage-smoke.mjs` into the same production revision for explicit operator checks; remove these two build commands on application removal. They never execute during app startup.

## Upgrade considerations

Keep SDK/presigner aligned. Recheck optional checksum defaults, signed Content-Type, stream consumption, part sizes/ETags and safe error mapping on both providers before updating images/SDK. Review Garage upgrade/layout/data instructions. No runtime upgrade/mutation is hidden in startup. Publication needs broader target validation, endpoint/proxy/browser TLS review, and a distribution policy; not published externally yet.

## Verification

Run storage unit/check/smoke and complete two-provider compatibility, governance/status, all four clean add-on fixtures, lint/types/tests/build/E2E and production containers without storage configuration. Clean fixture builds without DB/Auth/backend and executes the same RustFS/Garage suite. Removal is checked in a disposable consumer. Evaluation records actual results and limitations, not universal compatibility.

`bun run storage:compat --garage-ui` additionally starts the optional pinned UI in the disposable Garage stack, waits for its container healthcheck and checks reachability, rejected missing/invalid sessions and admin tokens, successful token login, Admin API bucket/cluster reads and S3 object listing. This does not add a UI dependency to the common Storage contract. Common CORS tests prove trusted-origin grants and browser rejection of untrusted preflights: a browser requires both a successful status and a matching origin grant. Garage 2.4.1 returns 403 with a wildcard error-response header; RustFS returns 403 without the header. Both deny the preflight; no provider-specific API workaround is needed.

## Agent guidance

Use capability-change and storage-change. Preserve private/lazy/server-only behavior, exact signed headers, honest post-upload limits, no hidden hard dependency, bounded telemetry and non-destructive removal. Update source/assets/compiled output/catalog/contract/evaluation together.
