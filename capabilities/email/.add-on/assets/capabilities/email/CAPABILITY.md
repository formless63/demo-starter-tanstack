# Email capability

Status: done. Optional foundational server capability (`defaultInstalled: false`); reference-app integration is tested separately. Evaluation: `EMAIL_MODULE_EVALUATION.md`.

## Requirements and boundaries

**Requires:** No reusable capability, database, Drizzle, auth, Jobs, API Platform, Storage or Observability. Official add-on `dependsOn: []`. A Bun-compatible development toolchain and Node-compatible server runtime are baseline prerequisites.

**Integrates with:** Jobs and Observability optionally; authentication through application-owned Better Auth wiring. **External:** SMTP only when used; optional local Mailpit. No migrations or persistent application data. No conflict is declared; review colliding owned asset paths before installation.

Nodemailer **10.0.13** is the pinned provider-neutral SMTP transport; `@types/nodemailer` **8.0.2** is development-only. No provider SDK, sendmail, HTTP mail API, queue, inbound mail, marketing, tracking, bounce processing or attachments.

## Configuration

Configuration is lazy: import/build/start works without SMTP while unused. `resolveEmailConfig()` and `validateEmailConfig()` validate structure without networking. Enabled reference magic links validate structure at auth initialization; SMTP availability never gates startup or `/api/health`.

| Variable | Contract |
| --- | --- |
| `SMTP_HOST` | Required on use; SMTP hostname/IP, not a URL. |
| `SMTP_PORT` | Explicit integer 1–65535; never selects security mode. |
| `SMTP_SECURITY` | `tls`: implicit TLS (`secure: true`); `starttls`: `secure: false, requireTLS: true`; `opportunistic`: both false, upgrades if offered. |
| `SMTP_USER`, `SMTP_PASSWORD` | Both or neither. No auth is valid for local/internal SMTP. Explicit credentials force an authentication attempt even when AUTH is not advertised. Server secrets; never logged. |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Required address, optional display name; configured fixed sender. |
| `EMAIL_REPLY_TO_ADDRESS`, `EMAIL_REPLY_TO_NAME` | Optional default reply-to; a name requires an address. |
| `EMAIL_MAX_RECIPIENTS` | Defaults to 50; integer 1–100 across To/Cc/Bcc, also enforced by transport. |

Certificate validation cannot be disabled through v1 config. Connection/greeting/DNS timeouts are 5 seconds; socket timeout 10 seconds. No pooling: each operation closes its SMTP session, and `close()`/`closeEmail()` releases transporter state. No automatic verification, hidden send retries or background process.

## Server API and safety

`src/integrations/email/*.server.ts` exports `createEmail(config?, operationHook?)`, `getEmail()`, `closeEmail()`, `sendEmail()`, `verifyEmailTransport()`, configuration helpers, `EmailError` and `renderMagicLinkEmail()` from their corresponding modules. Never import these into browser code.

```ts
import { getEmail } from './src/integrations/email/email.server'
const result = await getEmail().sendEmail({
  to: [{ address: 'person@example.test', name: 'Person' }],
  subject: 'A transactional message', text: 'Plain text', html: '<p>Plain text</p>',
})
```

Addresses are `{ address, name? }`; `to`, `cc`, `bcc` are arrays. Per-message `replyTo` is optional. From belongs to server configuration. Require at least one recipient and text or HTML. Addresses ≤254 characters, names ≤128, subject ≤200, combined text + HTML ≤1 MiB UTF-8. Headers reject controls/newlines; conservative address validation deliberately does not implement all RFC 5322 syntax. HTML supplied by applications must be safely rendered there.

Only To/Cc/Bcc/replyTo/subject/text/html are accepted. File/URL access is disabled in transport and message options; no raw MIME, arbitrary headers/envelope/DKIM/plugins/attachments, path/href body objects, or data-URL attachment conversion. Literal HTML URLs are content, never fetched by the server.

`verifyEmailTransport()` connects/negotiates/authenticates and sends no message. `sendEmail()` makes exactly one attempt. Result contains numeric `accepted`/`rejected` counts and `messageId` and `outcome: 'accepted' | 'partial' | 'rejected'`. Partial results must not trigger blind retries of accepted recipients; the application decides next actions. SMTP acceptance does not guarantee final inbox delivery.

Safe error codes: configuration, connection, timeout, tls, authentication, temporary-rejection, permanent-rejection, message, unknown. SMTP 4xx is transient/retryable; 5xx is permanent (auth has a dedicated code). Connection reset/timeout can be ambiguous and are not declared retryable. `toJSON()` contains only safe code/retryability/static message; original cause is server-only. Never automatically log the raw error.

## Installation and local operation

Install `capabilities/email/add-on.json` with the official TanStack CLI, or use the catalog-driven clean fixture. No other official add-on is installed. Configure ignored local/deployment environment only when sending.

`bun run email:dev:mailpit` explicitly starts optional `compose.email.yaml`: Mailpit **v1.31.3**, SMTP `127.0.0.1:1025`, UI `127.0.0.1:8025`. No relay/forwarding or persistent volume; default temporary storage, cap 100, Host allowlist localhost/127.0.0.1/mailpit. Default Chaos is off. `email:dev:down` stops it and captured mail is disposable.

```dotenv
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURITY=opportunistic
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM_ADDRESS=starter@example.test
EMAIL_FROM_NAME=Starter
```

Host-app ports above are not container addresses. An app on the same Docker network uses `SMTP_HOST=mailpit`, `SMTP_PORT=1025`; keep the UI local. This sink never forwards to real recipients.

`email:check` verifies without sending; `EMAIL_SMOKE_TO=person@example.test bun run email:smoke` sends exactly one unique message to an explicitly chosen recipient through explicitly configured SMTP, with no content output. `email:unit` runs local safety tests. `email:compat` creates an isolated random-port Mailpit project, tests actual SMTP and MIME via capture assertions, partial acceptance, bounds, required STARTTLS failure and deterministic 451/550 Chaos, then removes only its own containers/network. No real provider or credentials are used.

## Application integrations

Reference `src/lib/auth.ts` retains Better Auth `storeToken: 'hashed'` and existing OAuth/OIDC. When `MAGIC_LINK_ENABLED=true`, the awaited sender uses Email and validates the generated URL against `APP_BASE_URL` origin. Both text and escaped accessible HTML are delivered; there are no external resources. Browser failures are static 503 messages. The old console-link fallback is removed; inspect Mailpit instead. Disabled magic links need no SMTP configuration.

`src/lib/email.server.ts` is optional application-owned Observability wiring, absent from reusable assets. It records `app.email.*` send/verify, finite outcome/security, duration and recipient-count measurements; never addresses/subject/body/token/Message-ID/SMTP host/user/raw responses. Remove the wrapper and call `getEmail()` directly to keep Email without telemetry.

An application-owned Jobs handler may call Email and consult safe `EmailError.retryable`, with an explicit duplicate-delivery/retention policy. No generic email queue or persistence of messages is supplied.

## Provider example and operator duties

[Purelymail official setup](https://purelymail.com/docs/setup/technical) is only an example: `SMTP_HOST=smtp.purelymail.com`, `SMTP_PORT=465`, `SMTP_SECURITY=tls`; alternatively port 587 with `SMTP_SECURITY=starttls`. `SMTP_USER` is the full mailbox address; `SMTP_PASSWORD` is the password/app password (required for 2FA). Never contact the provider in tests. SPF/DKIM/DMARC, domain authentication, account limits and inbox deliverability remain operator/provider responsibilities; no DNS/account/credential administration is implemented.

## Lifecycle and verification

Application removal is documented in `docs/STARTING-A-PROJECT.md`: remove runtime/scripts/packages/env/Compose and optional wrapper, disable/remove magic links or explicitly choose another sender, remove reference enablement. Never restore console-link logging. No DB schema, provider account, DNS or remote credentials are removed. Reusable authoring pruning is a separate decision.

Clean fixture proves backendless install/types/build without SMTP, unit and real Mailpit/Chaos tests, runtime/package removal and types/build afterward. Root `email:compat --reference` proves real Better Auth delivery, persisted hashed token, canonical escaped link, no telemetry leak and verification/session. `--production` additionally probes the actual Node production image. Run ordinary governance/lint/types/tests/build/E2E, all add-on fixtures and full container CI. Use `.agents/skills/email-change/SKILL.md` when maintaining this domain.
