import { createHmac, randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
test("human cookie authorization and committed notification hint over SSE and WebSocket", async ({ page, context, request, baseURL }) => {
  test.setTimeout(60000);
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://starter:starter@127.0.0.1:5432/starter" });
  const userId = `realtime-e2e-${randomUUID()}`, token = randomUUID();
  const secret = process.env.BETTER_AUTH_SECRET ?? "development-only-secret-change-me-now";
  try {
    expect((await request.get("/api/realtime/sse")).status()).toBe(401);
    await pool.query('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())', [userId, "Realtime fixture", `${userId}@example.test`]);
    await pool.query('INSERT INTO "session" (id,user_id,token,expires_at,created_at,updated_at) VALUES ($1,$2,$3,now()+interval \'1 hour\',now(),now())', [randomUUID(), userId, token]);
    const cookie = encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`);
    await context.addCookies([
      { name: "better-auth.session_token", value: cookie, domain: new URL(baseURL as string).hostname, path: "/", httpOnly: true, sameSite: "Lax" },
      { name: "__Secure-better-auth.session_token", value: cookie, domain: new URL(baseURL as string).hostname, path: "/", httpOnly: true, sameSite: "Lax", secure: true },
    ]);
    await page.goto("/app/projects"); await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Color mode" })).toBeEnabled({ timeout: 15000 });
    const ownChannelQuery = `user:${createHash("sha256").update(userId).digest("hex")}`;
    expect(await page.evaluate(async channel => (await fetch(`/api/realtime/sse?channel=${encodeURIComponent(channel)}`)).status, ownChannelQuery)).toBe(401);
    const denied = await page.evaluate(async () => (await fetch("/api/realtime/sse?channel=user:foreign")).status); expect(denied).toBe(401);
    expect(await page.evaluate(async () => (await fetch("/api/realtime/sse?token=forbidden")).status)).toBe(401);
    await page.evaluate(async () => {
      const state = window as unknown as { fixtureSse: EventSource; fixtureWs: WebSocket; fixtureEvents: { sse: string[]; websocket: string[] } };
      state.fixtureEvents = { sse: [], websocket: [] };
      state.fixtureSse = new EventSource("/api/realtime/sse"); state.fixtureSse.addEventListener("notifications.created", event => state.fixtureEvents.sse.push((event as MessageEvent).data));
      state.fixtureWs = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime/websocket`); state.fixtureWs.addEventListener("message", event => state.fixtureEvents.websocket.push(String(event.data)));
      await Promise.race([new Promise<never>((_,reject) => setTimeout(() => reject(new Error("Realtime connection deadline")), 10000)), Promise.all([new Promise<void>((resolve,reject) => { state.fixtureSse.onopen = () => resolve(); state.fixtureSse.onerror = () => reject(new Error("SSE authorization failed")); }), new Promise<void>((resolve,reject) => { state.fixtureWs.onopen = () => resolve(); state.fixtureWs.onerror = () => reject(new Error("WS authorization failed")); })])]);
    });
    await page.getByRole("button", { name: "New project" }).click(); await page.getByLabel("Name", { exact: true }).fill("Realtime fixture project"); await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureEvents: { sse: string[]; websocket: string[] } }).fixtureEvents), { timeout: 15000 }).toMatchObject({ sse: [expect.any(String)], websocket: [expect.any(String)] });
    const events = await page.evaluate(() => (window as unknown as { fixtureEvents: { sse: string[]; websocket: string[] } }).fixtureEvents);
    expect(events.sse[0]).toBe(events.websocket[0]); const hint = JSON.parse(events.sse[0]); expect(Object.keys(hint.data)).toEqual(["notificationId"]);
    const stored = await pool.query("SELECT recipient_id, title, body FROM notification WHERE id=$1", [hint.data.notificationId]); expect(stored.rows[0].recipient_id).toBe(userId); expect(stored.rows[0].title).toBe("Project created");
    expect(JSON.stringify(hint)).not.toContain(stored.rows[0].title); expect(JSON.stringify(hint)).not.toContain(stored.rows[0].body);
    await page.getByRole("link", { name: "Notifications", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Project created", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mark read", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mark unread", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Unread only" }).check();
    await expect(page.getByText("No notifications yet.", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Unread only" }).uncheck();
    await page.getByRole("button", { name: "Mark unread", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mark read", exact: true })).toBeVisible();
    // Reconnect produces no replay event; close the fixture connections before reload.
    await page.evaluate(() => { const state = window as unknown as { fixtureSse: EventSource; fixtureWs: WebSocket }; state.fixtureSse.close(); state.fixtureWs.close(); });
    const plainTitle = "<tag>";
    await pool.query("UPDATE notification SET title=$1 WHERE id=$2 AND recipient_id=$3",[plainTitle,hint.data.notificationId,userId]);
    await page.reload();
    const escapedTitle = page.getByRole("heading",{name:plainTitle,exact:true});
    await expect(escapedTitle).toBeVisible();
    await expect(escapedTitle.locator("tag")).toHaveCount(0);
    const ownChannel = `user:${createHash("sha256").update(userId).digest("hex")}`; expect(ownChannel).toHaveLength(69);
  } finally { await pool.query("DELETE FROM notification WHERE recipient_id=$1", [userId]); await pool.query('DELETE FROM "user" WHERE id=$1', [userId]); await pool.end(); }
});
