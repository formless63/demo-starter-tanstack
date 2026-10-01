import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { api, captured } from "./email-mailpit";

// Exercise the real Better Auth request handler against a disposable SMTP sink.
// Capture process output internally so even a regression cannot print a login token.
const stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr);
let output = "";
const capture: typeof process.stdout.write = ((chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: () => void) => {
	output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
	if (typeof encodingOrCallback === "function") encodingOrCallback(); else callback?.();
	return true;
}) as typeof process.stdout.write;
process.stdout.write = capture; process.stderr.write = capture;
const address = `email-auth-${randomUUID()}@example.test`;
let link = "", token = "", failed = false;
let cleanup: (() => Promise<void>) | undefined;
try {
	assert.equal(process.env.MAGIC_LINK_ENABLED, "true");
	assert.ok(process.env.MAILPIT_API_URL);
	const { auth } = await import("../src/lib/auth");
	assert.equal((auth.options as import("better-auth").BetterAuthOptions).verification?.storeIdentifier, undefined);
	const { db } = await import("../src/db");
	const { user, verification } = await import("../src/db/schema");
	const { shutdownObservability } = await import("../src/integrations/observability/runtime.server");
	const { closeApplicationEmail } = await import("../src/lib/email.server");
	cleanup = async () => { await db.delete(user).where(eq(user.email, address)); closeApplicationEmail(); await shutdownObservability(); await db.$client.end(); };
	const base = process.env.APP_BASE_URL || "http://localhost:3000";
	const request = await auth.handler(new Request(`${base}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email: address, callbackURL: "/app" }) }));
	assert.equal(request.status, 200);
	const mail = await captured(process.env.MAILPIT_API_URL!, item => item.To.some(to => to.Address === address));
	assert.equal(mail.To[0]?.Address, address); assert.ok(mail.Text); assert.ok(mail.HTML);
	link = mail.Text.match(/https?:\/\/[^\s]+/)?.[0] || "";
	const parsed = new URL(link); assert.equal(parsed.origin, new URL(base).origin);
	token = parsed.searchParams.get("token") || ""; assert.ok(token);
	assert.ok(mail.HTML.includes(link.replaceAll("&", "&amp;"))); assert.doesNotMatch(mail.HTML, /<img|<script|<style/);
	// The persisted verification key must not be the plaintext bearer token.
	const stored = await db.select().from(verification);
	assert.ok(stored.some(row => row.value.includes(address)));
	assert.ok(stored.filter(row => row.value.includes(address)).every(row => row.identifier.startsWith("magic-link:")));
	assert.ok(stored.every(row => row.identifier !== token && !row.value.includes(token)));
	const verified = await auth.handler(new Request(link, { headers: { Origin: base } }));
	assert.ok([302, 303].includes(verified.status));
	assert.ok(verified.headers.get("set-cookie")?.includes("session_token"));
	assert.equal(new URL(verified.headers.get("location")!, base).pathname, "/app");
	const [account] = await db.select().from(user).where(eq(user.email, address));
	assert.equal(account?.emailVerified, true);
	const replay = await auth.handler(new Request(link, { headers: { Origin: base } }));
	assert.ok(!replay.headers.get("set-cookie")?.includes("session_token"));
	assert.ok(replay.headers.get("location")?.includes("error="));
	await api(process.env.MAILPIT_API_URL!, "chaos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Sender: { ErrorCode: 550, Probability: 100 } }) });
	try {
		const failure = await auth.handler(new Request(`${base}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email: address, callbackURL: "/app" }) }));
		assert.equal(failure.status, 503);
		const body = await failure.text();
		assert.ok(body.includes("Email delivery unavailable")); assert.doesNotMatch(body, /550|SMTP|Chaos|example\.test/);
	} finally { await api(process.env.MAILPIT_API_URL!, "chaos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" }); }
	assert.ok(output.includes("Email operation completed"));
	for (const sensitive of [address, link, token, mail.MessageID, mail.Subject, process.env.EMAIL_FROM_ADDRESS!, process.env.SMTP_HOST!]) assert.ok(!output.includes(sensitive), "Email content leaked to telemetry");
} catch { failed = true; }
finally {
	try { await cleanup?.(); } catch { failed = true; }
	// Check after shutdown as well, since telemetry can flush then.
	if ((link && output.includes(link)) || (token && output.includes(token)) || output.includes(address)) failed = true;
	process.stdout.write = stdout; process.stderr.write = stderr;
}
if (failed) { console.error("Better Auth SMTP fixture failed; captured output suppressed to protect tokens"); process.exitCode = 1; }
else console.info("Real Better Auth SMTP delivery, hashed token, safe telemetry and verification/session passed");
