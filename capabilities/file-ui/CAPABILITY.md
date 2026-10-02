# File UI capability

Status: in-progress; opt-in (`defaultInstalled: false`). Sole hard capability dependency: Object Storage. Root reference implementation is under verification and will only be marked reference-enabled after exact-head gates pass. Evaluation: `FILE_UI_MODULE_EVALUATION.md`.

## Bounded v1 contract

Reusable React `FileUI` accepts a caller-owned client. The workflow accepts explicit storage, trusted identity/policy, and atomic metadata adapters; no Drizzle, Better Auth, Jobs, Audit, Search, Notifications, root aliases or hidden startup work. Metadata preview only; no active document, HTML, SVG or inline image preview. Attachment-only download is deliberately safe for arbitrary uploaded bytes. No antivirus/content safety claim.

The raw upload proxy defaults to 10 MiB, configurable from 1 byte to 100 MiB. It counts actual streamed bytes before any reservation or S3 PUT, buffers only the configured bound, computes SHA-256, validates filename (1–180 characters, trimmed NFC, no path/control characters) and media type, then atomically reserves owner + idempotency key + generated opaque key. Fingerprint includes digest, actual size and canonical metadata. The caller never supplies owner or storage key. File IDs are opaque UUIDs. Optional expected digest/size must match actual body.

`uploading`, `ready`, `cleanup-pending`, `removed` are persistent states; removed receipts are not evicted or reused. Identical replay returns recorded state/result, conflicting fingerprint rejects, and an uploading replay never launches another PUT. After successful PUT, HEAD checks size/type/hash metadata and bounded GET verifies actual content hash before CAS readiness. The supplied File UI storage factory overrides SDK maxAttempts to 1 without changing Object Storage defaults. Custom adapters must make only one PUT attempt and report success only after that writer finishes; never hide transport retries that can leave prior writers in flight. Workflow replay is never another operation.

Metadata exceptions trigger a durable reread before any delete: the publication may have committed. Persistence outage fails closed and retains the object/key. Cancellation aborts supported PUT/HEAD/GET transport. Failed or ambiguous PUT quarantines the key with `writerStopped=false`; even a failed client transport may have reached the provider. A remove racing a writer cannot claim complete cleanup. Cleanup never uses the cancelled request signal and can retry; uncertain keys are never recycled. Lease expiry alone is not proof of quiescence. No zero-orphan guarantee.

The bounded operator `file-ui:reconcile <owner> <file-id> [--writers-stopped]` only processes an explicit receipt. Stop/fence every prior writer before asserting `--writers-stopped`. Without proof, reconciliation retains quarantine. Operator policy is a server-only application responsibility, never a browser-supplied boolean or lease-age heuristic. No new Jobs dependency.

Every read/mutation authorizes its trusted caller, and every metadata operation includes owner scope. Browsers only see FileView fields id/name/type/size/state. Download streams with attachment disposition, application/octet-stream, no-sniff, no-store and sandbox CSP. All errors are bounded safe codes, never provider responses. Filenames and object keys are not logged. Browser cancellation reports unknown/pending state honestly; retry retains exact bytes/key; status/error feedback and controls are keyboard accessible.

## Adapters and persistence

`FileMetadata.reserve` must enforce unique `(owner,idempotencyKey)` atomically. `cas` must atomically check owner + id + revision; `get`, `byToken` and `list` must enforce owner scope. Methods return detached records. Production adapters must retain receipts across restart and deployment; uniqueness must hold across processes. Do not evict records while idempotency keys might be replayed. List is bounded to newest 100 receipts; v1 has no unbounded browsing or receipt-purge claim.

`createMemoryFileMetadata` is a bounded (default 100, maximum 10,000) single-process synthetic fixture, explicitly NOT durable. Capacity exhaustion fails closed; it never evicts idempotency evidence. The clean generated consumer demonstrates workflow with synthetic identity and real supported Storage fixtures. It does not quietly install authentication or a database.

Root reference alone uses existing Better Auth and PostgreSQL/Drizzle through `src/lib/file-ui-metadata.server.ts`, `src/lib/file-ui.server.ts`, and root-owned `src/db/file-ui-schema.ts`. `/app/files` is protected and native `/api/files/$` restores current session on every request. Cookie mutation endpoints require exact same-origin Origin and explicit X-File-UI header, independent of the server-function CSRF middleware. There are no multipart/signed-upload bearer endpoints. Storage configuration is lazy, unchanged from Object Storage. No new environment variables, runtime services or packages.

Migration `0016_file_ui.sql` is journal index14 with cumulative snapshot0014. All fourteen prior entries, SQL and snapshot bytes are preserved, including preexisting non-monotonic SQL filename prefixes. It adds only `file_ui_files` and scoped/key indexes. Durable intent/receipt data and migration history survive runtime removal. Existing table snapshots are cumulative; never regenerate applied history.

## Installation and verification

Compile `bun run add-ons:compile file-ui`, then install the retained add-on via official CLI using the catalog-aware dependency server. `dependsOn: [object-storage]` is exact. Assets use relative imports only. Normal build/install requires no storage credentials. The generic fixture installs into a clean scaffold, runs type checks, backendless state tests, actual S3 SDK/local HTTP protocol, shipped React browser component, and pinned RustFS/Garage lifecycle. Hosted browser and Docker gates are required, not represented by mock-only tests.

Commands: `file-ui:unit`, `file-ui:protocol`, `file-ui:compat`, `file-ui:browser`; root additionally `file-ui:database`, `file-ui:http` and `file-ui:reconcile`. Generic `add-ons:test file-ui` runs install/browser/provider/runtime/removal/rebuild. UI fixture's fake client isolates component interactions only; protocol/provider fixtures exercise the real workflow and Object Storage SDK. Root native HTTP fixture starts the actual Vite dev and production Node servers against local S3 protocol and synthetic sessions; it verifies raw upload, single-PUT replay, exact attachment bytes/security headers, CSRF, owner denial and removal404. This is a hosted-required transport gate. Root database fixture creates/drops only unique disposable databases and verifies clean/upgrade migration, atomic races, owner scope, restart, immutable prior hashes and retained data.

## Removal

There is no CLI uninstall transaction. Delete File UI runtime UI/client/workflow, root `/app/files` and `/api/files/$`, reference wrappers/operator tooling and navigation; remove file-ui scripts and reference enablement. Keep Object Storage files/dependencies/configuration, buckets, objects and credentials intact. Keep root `src/db/file-ui-schema.ts` export, `0016_file_ui.sql`, journal/snapshot and durable receipts. Do not drop table or delete objects merely to remove UI. Destructive retention/purge is a separate authorized operator decision.

Generated fixture removal deletes only File UI assets and package scripts, then proves Object Storage can still read its retained marker, typechecks and rebuilds. Reusable authoring workspace can be retained separately. Never delete user data or migrate backwards. Full recipes: docs/STARTING-A-PROJECT.md.
