import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	type TransferContext,
	TransferError,
} from "../../integrations/import-export/validation";
import { auth } from "../../lib/auth";
export async function transferRequestContext(
	headers = getRequestHeaders(),
): Promise<TransferContext> {
	const session = await auth.api.getSession({ headers });
	if (!session?.user) throw new TransferError("unauthenticated");
	return {
		requesterId: session.user.id,
		scope: { kind: "user", id: session.user.id },
	};
}
