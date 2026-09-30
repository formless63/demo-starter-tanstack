# Object Storage module evaluation

Capability #4 is an optional, private server S3 primitive, not File UI or an asset model. Full local verification passes; CI confirms the same release path.

## SDK and official sources

Both AWS SDK v3 packages are pinned 3.1143.0 (registry-verified stable release). [AWS streaming guidance](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html) establishes explicit Body ownership; [credential-chain documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) preserves IAM/container/instance credentials without long-lived static secrets. The small explicit multipart API does not need lib-storage. No MinIO SDK/service is added.

[AWS presigner source](https://github.com/aws/aws-sdk-js-v3/blob/main/packages/s3-request-presigner/src/presigner.ts) normally treats Content-Type as unsignable unless explicitly signable; the helper supplies `signableHeaders` and returns exact required headers. [AWS upload guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) describes matching Content-Type. Both providers actually reject mismatched headers in our suite, not just URL-string assertions.

## Providers and infrastructure

[RustFS stable release](https://github.com/rustfs/rustfs/releases/tag/1.0.0): official `rustfs/rustfs:1.0.0`, stable September 16, 2026. Later 1.0.1 previews are deliberately excluded. [Container guidance](https://docs.rustfs.com/en/installation/container) specifies non-root UID 10001; named data/log volumes inherit image permissions. [Compatibility matrix](https://docs.rustfs.com/en/reference/s3-compatibility) supports common operations, presigned PUT/GET and core multipart, while POST form checksum remains planned. PUT/GET, not POST, are our common baseline.

[Garage official quickstart](https://garagehq.deuxfleurs.fr/documentation/quick-start/) uses `dxflrs/garage:v2.3.0`, `--single-node --default-bucket` plus explicit default key/secret/bucket to initialize layout and identity. [Garage compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/) describes common S3, including multipart, and limitations: no AWS-style ACL/bucket-policy authorization or versioning in this contract; use provider-native permissions administratively. No workaround is needed for the tested common surface.

UI alternatives researched: `khairul169/garage-webui` 1.1.0 last released September 2025 versus actively maintained [Noooste/garage-ui](https://github.com/Noooste/garage-ui/releases/tag/garage-ui-0.13.0) 0.13.0 released September 21, 2026. Select third-party `noooste/garage-ui:v0.13.0` (actual Docker tag confirmed, not `0.13.0`). It is not official Garage software. The image runs non-root and has `/health`; token login is enabled, with full-admin Garage token access. Known local admin credentials require loopback bindings and must never leave development. UI is optional and outside the S3 correctness dependency.

Separate Compose profiles leave default PostgreSQL/app/worker behavior unchanged. Both storage examples are single-node development fixtures without redundancy. Bucket/CORS bootstrap is an explicit dev-only command, never app startup. CORS allows a specific loopback app origin with PUT/GET/HEAD and exposes ETag, not a production wildcard. Provider layout/bootstrap is admin tooling, not a provider-specific application API.

## Contract and portability

The `.server.ts` boundary follows [Start import protection](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model): server-only files are denied in client imports, and there is no mixed client barrel. Configuration errors identify only the affected known variable names, never supplied values.

Endpoint absent uses normal AWS resolution/addressing; custom endpoint defaults path-style with explicit override. Region uses STORAGE then AWS fallbacks. Explicit credentials require a complete pair, optional session token; absent pair leaves SDK credential chain intact. No live AWS requests occur in tests. AWS portability remains an assumption based on official SDK/configuration/common protocol, not an AWS-certified claim. Optional checksum calculations use SDK `WHEN_REQUIRED` to avoid forcing optional features into the common contract; no provider-specific request headers.

Keys are optional configured prefix/application namespace/random UUID, with safe conservative segments; original filenames belong to application records or reviewed metadata. Private defaults set no ACL/policy. Small bounded ASCII metadata plus content type/cache control are accepted; ETag is opaque. Downloads expose streams rather than unlimited buffering; consumers must drain/destroy them. Server streams with known length and real streaming downloads are tested.

URLs expire by default after 600 seconds, bounded 30–3600, and may expire earlier with signing credentials. They are bearer credentials and can be reused until expiry. Applications authorize/validate proposed metadata before signing, then HEAD-check size/type/metadata and delete/reject invalid uploads afterwards. HEAD is not atomic with URL replay; hard pre-ingest limits or atomic approval need a stronger application-controlled mechanism. Content-Type matching proves header integrity, not actual file type.

Multipart validates ID, bounds 1–10000, unique ascending parts and ETags; tests use a 5 MiB non-final part and small final part for standard S3 portability. Completed content and metadata are readable, aborted uploads reject ListParts. Applications own durable session state and orphan cleanup; no DB or Jobs flow is introduced.

Safe `StorageError` classification preserves a non-public server cause. No reusable logs exist. Optional generic operation hook enables the application-owned wrapper to emit bounded `app.storage.*` counters/durations/outcomes and safe spans/logs, with no buckets/keys/IDs/URLs or results as labels. Absence/removal of Observability does not affect Storage.

## Evidence and lifecycle

The identical real suite passes on both pinned providers: HEAD bucket, streamed PUT/GET, HEAD metadata/cache/ETag/time/length, prefix pagination, private presigned GET, exact signed PUT, rejected mismatched type, accepted/rejected HEAD size/type/metadata policies, multipart create/presigned parts/complete/read/abort, and own-prefix cleanup. Origin-specific CORS preflight passes on both. The instrumented reference suite also passes on both; reusable standalone tests have no telemetry dependency.

Official add-on assets own all integration/operational/provider fixtures and no shared route/auth/schema. `dependsOn: []` is truthful; the fixture explicitly rejects Drizzle/Auth/Jobs/API/Observability installation, typechecks/builds without a storage backend, exercises both real providers, then removes the runtime packages/files and rebuilds. Retained authoring assets do not force AWS packages into a lean application's typecheck.

Application removal and authoring pruning are separate. Removal never contacts or deletes remote objects/buckets/credentials and retains local volumes; explicit cleanup remains operator-owned. CI uses the catalog-driven fourth add-on job plus reference compatibility coverage, no real OAuth/AWS secrets.

Before publication: define distribution/support/version policy, validate more deployment runtimes and production TLS/proxy/browser endpoints, review least privilege and replay/approval requirements per application, and expand provider surface only with evidence. Unlike Jobs/API this is purely additive with no schema or shared auth file. Like Observability it must stay backendless at build/start; unlike telemetry the external data service is required only when operations are invoked. No new framework/add-on generator is needed.

Verification: frozen install, governance/status, lint/types, 28 root tests, build, three Playwright cases and all four independent add-on fixtures pass. Storage's fixture proves backendless install/build, both real providers and post-removal type/build. A fresh reference-app removal copy installs without the two AWS packages and passes governance/lint/types, all 26 remaining tests and build; remote services/data are untouched. The optional UI `/health` confirms actual pinned v0.13.0 reachability. Production Node 24 image operational storage bundles run the real suite on both providers, and the normal stack migrates a clean database, starts a non-root app/worker and passes health/OpenAPI/docs with Storage completely absent. `STORAGE_SMOKE_IMAGE` adds Node-image checks to the same compatibility harness in CI; cleanup owns only unique test prefixes/stacks/volumes.

Removal browser verification also passes all three cases on an isolated strict test port after Vite's fresh dependency optimizer completes. Initial cold-load client import failure and a shared-port collision with another local starter were test-environment findings, not hidden Storage dependencies; no application redesign/retry policy was added.
