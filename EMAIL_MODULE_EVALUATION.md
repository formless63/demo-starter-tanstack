# Email module evaluation

Email is the fifth optional foundational capability. Independent add-on dependencies are empty; reference Better Auth/Observability integrations are application-owned. No PostgreSQL, Jobs, API Platform or Storage is required to send SMTP mail.

## Current upstream decisions

Checked current official documentation and stable releases on 2026-09-30:

- [Nodemailer SMTP transport](https://nodemailer.com/smtp) and [message API](https://nodemailer.com/message): pinned **10.0.13**, verified against the npm stable registry (the planning baseline 10.0.8 was superseded). Type declarations **8.0.2** are current on npm; transport `maxRecipients` is also enforced through the current runtime option.
- [Better Auth Magic Link](https://www.better-auth.com/docs/plugins/magic-link): retain `storeToken: 'hashed'`, awaited `sendMagicLink`, existing cookie integration and OAuth/OIDC.
- [Mailpit runtime options](https://mailpit.axllent.org/docs/configuration/runtime-options/), [Chaos](https://mailpit.axllent.org/docs/integration/chaos/) and tagged API/source: pinned **axllent/mailpit:v1.31.3** (supersedes planning 1.31.1).
- [Purelymail technical setup](https://purelymail.com/docs/setup/technical): smtp.purelymail.com implicit TLS 465 or required STARTTLS 587; full-mailbox username, password/app password. Documentation only, no provider test connection.

SMTP/Nodemailer provides a portable mature MIME/TLS/auth implementation without provider SDKs, HTTP mail APIs or another application framework. IPv6 literals and uncommon quoted mailbox syntax are intentionally outside this small conservative v1 configuration/address grammar.

## Contract and security

Security is explicit: `tls` maps to secure true, `starttls` maps to secure false/requireTLS true, `opportunistic` maps to both false with normal advertised upgrade behavior. Port never selects a mode. TLS certificate validation stays enabled with no override in the public config. Credentials are complete pair or absent; configured credentials set `forceAuth` so verification cannot silently succeed without authenticating when AUTH is not advertised. SMTP 454 authentication rejection remains temporary/retryable; 535 is authentication/non-retryable. Lazy configuration accepts unused installation and enabled auth validates structure without contacting SMTP.

Non-pooled SMTP sessions close per operation. Connection/greeting/DNS timeouts 5s and socket 15s bound stalls; no startup/readiness verification, worker or daemon. `close()` releases state; normal exit also clears singleton references. The app-owned singleton has the same close lifecycle.

From/default reply-to are fixed server configuration; recipients use structured addresses. Counts default 50/max100 across To/Cc/Bcc and the transport has a second `maxRecipients` guard. Addresses 254/name128/subject200 characters; each body ≤1MiB UTF-8. Controls are rejected in headers. Nodemailer generates RFC MIME; no home-grown complete RFC parser.

Whitelist message fields, with `disableFileAccess`/`disableUrlAccess` at both layers and `attachDataUrls: false`. No attachments, body path/href objects, raw MIME, custom envelope/headers/DKIM or plugin input. Literal HTML resources remain application content but the server never resolves them. This keeps file disclosure/SSRF and unreviewed content expansion out of v1.

SMTP response classification is safe and static: 451 temporary/retryable, 550 permanent/non-retryable; auth/TLS/config/message failures are distinct. Original causes stay server-only and `toJSON()` omits them. Connection reset/timeout are ambiguous and not automatically retryable. No automatic send retries: the peer may accept a message before a lost acknowledgement. Partial acceptance is a typed result carrying server-only accepted/rejected/messageId, never a blanket retry-triggering error.

## SMTP and authentication evidence

Real disposable Mailpit tests pass SMTP verification with zero captured messages; text-only, HTML-only and Unicode multipart delivery; From/default Reply-To/To/Cc; generated Message-ID; accepted Bcc envelope; input bounds/content rejection; partial recipient acceptance; required STARTTLS failure against a non-TLS sink. Mailpit API is assertion-only, never the HTTP send endpoint.

Mailpit adds Bcc metadata to its stored raw message. A transparent fixture-only TCP tap therefore verifies original SMTP DATA contains no Bcc header while RCPT TO includes the Bcc recipient. The capture API independently confirms the envelope recipients. This avoids incorrectly treating capture-enriched MIME as wire MIME.

Chaos is enabled only for isolated fixtures. Setting `Sender.ErrorCode` to 451/550 and `Probability` to 100 produces Nodemailer envelope errors with responseCode 451/550; both safe classifications are tested, with no message capture or retry. Resetting Chaos restores ordinary operation. Partial acceptance uses Mailpit's allowed-recipient regex to reject one recipient while accepting the other.

Reference smoke exercises the real Better Auth sign-in request handler, captures SMTP text/HTML, checks canonical `APP_BASE_URL` origin and HTML encoding, verifies the persisted key is not the raw token, follows verification and proves redirect/session plus verified email. Process output is captured internally and checked for recipient/sender/host/subject/body link/token/Message-ID leakage before releasing only a static success/failure message. No console fallback remains. A deterministic SMTP 550 also proves the real handler returns only a static 503 browser failure. Production uses the same callback without the former deliberate throw.

Mailpit is explicitly optional, loopback-bound, temporary by default, capped 200, Host-allowlisted, and configured without forwarding/relay or named volumes. Unique Docker projects/random ports isolate fixture state and teardown removes only fixture-owned resources. Production readiness remains database-only with Email unconfigured/unused.

## Optional composition and lifecycle

`src/lib/email.server.ts` owns telemetry. Finite send/verify/outcome/security and duration/count measurements use `app.email.*`; no addresses, subject/body/link/token/Message-ID/SMTP host/user or response enter signals. Independent assets import no telemetry code. Jobs queueing is deferred because message retention, idempotency and duplicate delivery require application policy; an application-owned handler may deliberately compose Email and safe retryability.

Clean installation uses the established official TanStack custom add-on compiler/URL installer and catalog-driven fixture. It builds/types with SMTP absent, rejects DB/auth/Jobs/API/Observability dependencies, tests safety and real SMTP/Chaos, removes owned runtime/packages/env/Compose, then types/builds again. Application removal disables magic links or chooses another sender and removes the optional wrapper; never restore console links. There is no owned schema, remote account, credential revocation or DNS cleanup. Authoring pruning stays separate.

Publication requires pinned dependencies, synchronized retained distributable, evaluation/skill/contracts, generic fixture matrix and green ordinary/full-container CI. Unlike Storage, Email needs no persistent dev volume/bootstrap or shared consumer database. Unlike a durable notification workflow, SMTP acceptance and partial/ambiguous delivery are explicit primitive outcomes rather than hidden orchestration.

Domain authentication/deliverability (SPF/DKIM/DMARC), provider limits, remote account management and bounce handling remain provider/operator responsibilities. Purelymail configuration is illustrative only; normal mailbox/password or app-password authentication works with either documented explicit TLS mode.

## Verification results

Local verification passed: frozen install; harness check and 120 synthetic hook tests; capability status/check; ordinary lint/types/tests (157 passing)/build; three Playwright checks; all five official clean add-on fixtures; independent Email runtime removal and reference-app removal with fresh dependencies/types/build. SMTP/Chaos covers 451/550, authentication 535, required STARTTLS failure, refused connections and partial acceptance. In-memory logs/spans/metrics assertions prove bounded fields and no email/SMTP content.

The final Node 24.21.0 production image passed migrations, Jobs doctor/smoke/worker, health without SMTP, request correlation, OpenAPI/docs, both Storage providers/UI and real enabled SMTP magic-link/session with safe logs. Local builds used the identical pinned image releases via public mirrors after Docker Hub rate limiting, plus only a temporary managed-cloud CA secret for package downloads; repository Dockerfile TLS/security policy is unchanged. Hosted full CI is the final publication check on main.
