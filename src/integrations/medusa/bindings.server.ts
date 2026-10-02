import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
	connectionId,
	opaqueId,
	parse,
	resourceKind,
	scopeSchema,
	uuid,
} from "./contract";
import type { Executor } from "./medusa.server";

const bindingInput = z.strictObject({
	scope: scopeSchema,
	localResourceId: opaqueId,
	connectionId,
	kind: resourceKind,
	remoteId: opaqueId,
});
/** Trusted application/operator seam only. Caller authorizes mapping and owns commit; never a browser or callback API. */
export async function createBindingInTransaction(
	tx: Executor,
	input: z.input<typeof bindingInput>,
) {
	const v = parse(bindingInput, input);
	const id = randomUUID();
	await tx.execute(
		sql`insert into medusa_binding(id,scope_kind,scope_id,local_resource_id,connection_id,resource_kind,remote_id,created_at) values(${id},${v.scope.kind},${v.scope.id},${v.localResourceId},${v.connectionId},${v.kind},${v.remoteId},now())`,
	);
	return { bindingId: id };
}
/** Retire rather than remap. History and all provider resources retained. */
export async function retireBindingInTransaction(tx: Executor, id: string) {
	parse(uuid, id);
	await tx.execute(
		sql`update medusa_binding set retired_at=now(),revision=revision+1,lease_token=null,lease_until=null where id=${id} and retired_at is null`,
	);
}
