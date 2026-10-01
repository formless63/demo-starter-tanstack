import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { getJobsClient, stopJobsClient } from "../src/integrations/jobs/client.server";
import { createNotificationInTransaction } from "../src/integrations/notifications/transaction.server";
import { createNotification, queryNotifications, markRead, markUnread } from "../src/integrations/notifications/notifications.server";
import { notifications } from "../src/integrations/notifications/schema";
const recipientId = `notification-fixture-${randomUUID()}`;
const input = { recipientId, type: "fixture.created", title: "Fixture", body: "Private body stays out of Jobs", metadata: { source: "fixture" } };
const ids: string[] = []; const jobIds: string[] = [];
try {
  const boss = await getJobsClient();
  let rolledBackId = "", rolledBackJob = "";
  await assert.rejects(db.transaction(async tx => {
    // PostgreSQL domain write, notification and native transactional pg-boss adapter.
    await tx.execute(sql`CREATE TEMPORARY TABLE notification_fixture_domain (id text) ON COMMIT DROP`);
    await tx.execute(sql`INSERT INTO notification_fixture_domain VALUES ('rollback')`);
    const result = await createNotificationInTransaction(tx, input, ["email"]);
    rolledBackId = result.notification.id; rolledBackJob = result.jobIds[0];
    throw new Error("fixture rollback");
  }), /fixture rollback/);
  assert.equal((await db.select().from(notifications).where(eq(notifications.id, rolledBackId))).length, 0);
  assert.equal((await boss.findJobs("notifications.deliver", { id: rolledBackJob })).length, 0);
  const committed = await db.transaction(async tx => {
    await tx.execute(sql`CREATE TEMPORARY TABLE notification_fixture_domain (id text) ON COMMIT DROP`);
    await tx.execute(sql`INSERT INTO notification_fixture_domain VALUES ('commit')`);
    const result = await createNotificationInTransaction(tx, input, ["email", "ntfy"]);
    const domain = await tx.execute(sql`SELECT id FROM notification_fixture_domain`); assert.equal(domain.rows[0].id, "commit"); return result;
  });
  ids.push(committed.notification.id); jobIds.push(...committed.jobIds);
  for (let i=0; i<6; i++) ids.push((await createNotification(db, { ...input, type: i % 2 ? "fixture.other" : input.type })).id);
  const tied = new Date("2026-01-01T00:00:00.000Z");
  // Fixture-only timestamps: callers cannot set these through the creation API.
  await db.update(notifications).set({ createdAt: tied }).where(eq(notifications.recipientId, recipientId));
  const expected = [...ids].sort().reverse(), collected: string[] = []; let cursor: string | undefined;
  do { const page = await queryNotifications(db, recipientId, { limit: 2, cursor }); collected.push(...page.notifications.map(n => n.id)); cursor = page.nextCursor ?? undefined; } while (cursor);
  assert.deepEqual(collected, expected); assert.equal((await queryNotifications(db, "foreign-recipient")).notifications.length, 0);
  assert.equal(await markRead(db, "foreign-recipient", ids[0]), false); assert.equal(await markUnread(db, "foreign-recipient", ids[0]), false);
  assert.equal(await markRead(db, recipientId, ids[0]), true); const once = (await queryNotifications(db, recipientId)).notifications.find(n => n.id === ids[0])?.readAt;
  assert.equal(await markRead(db, recipientId, ids[0]), true); assert.equal((await queryNotifications(db, recipientId)).notifications.find(n => n.id === ids[0])?.readAt?.getTime(), once?.getTime());
  assert.equal((await queryNotifications(db, recipientId, { unreadOnly: true })).notifications.length, 6);
  assert.equal(await markUnread(db, recipientId, ids[0]), true); assert.equal(await markUnread(db, recipientId, ids[0]), true);
  assert.equal((await queryNotifications(db, recipientId, { type: "fixture.other" })).notifications.length, 3);
  for (const id of jobIds) { const [job] = await boss.findJobs("notifications.deliver", { id }); assert.deepEqual(Object.keys(job.data as object).sort(), ["channel", "notificationId"]); assert.equal(job.retryLimit, 5); }
  console.info("Notifications migration, atomic commit/rollback, private Jobs payload, recipient isolation, idempotent read/unread and tied keyset pagination verified");
} finally {
  await db.delete(notifications).where(and(eq(notifications.recipientId, recipientId)));
  const boss = await getJobsClient(); for (const id of jobIds) await boss.deleteJob("notifications.deliver", id); await stopJobsClient();
  // Explicit CLI lifecycle owns its connection; no process-global shutdown hook.
  await db.$client.end();
}
