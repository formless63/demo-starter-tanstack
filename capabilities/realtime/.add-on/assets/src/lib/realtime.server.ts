import { z } from "zod";
import {
	createRealtime,
	defineRealtimeEvents,
	RealtimeError,
	realtimeTransports,
} from "../integrations/realtime/realtime.server";

const registry = defineRealtimeEvents({
	"application.updated": z.strictObject({ id: z.string() }),
});
const processState = globalThis as typeof globalThis & {
	__applicationRealtime?: ReturnType<typeof createRealtime<typeof registry>>;
};
if (!processState.__applicationRealtime) {
	const hub = createRealtime(registry);
	processState.__applicationRealtime = hub;
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.once(signal, () => hub.close());
}
export const applicationRealtime = processState.__applicationRealtime;
export async function authorizeRealtime(
	_request: Request,
	transport: "sse" | "websocket",
): Promise<readonly string[]> {
	if (!realtimeTransports().has(transport))
		throw new RealtimeError("configuration");
	// Application MUST restore its human cookie session and authorize exact channels here. Default deny-all.
	throw new RealtimeError("unauthorized");
}
