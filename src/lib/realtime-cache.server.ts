import { createHash } from "node:crypto";
import { z } from "zod";
import type { Cache } from "../integrations/cache/cache.server";
import {
	authorizedChannels,
	type EventRegistry,
	encodeEvent,
	type Realtime,
	RealtimeError,
} from "../integrations/realtime/realtime.server";

const envelopeSchema = z.strictObject({
	id: z.uuid(),
	type: z.string(),
	occurredAt: z.iso.datetime(),
	data: z.unknown(),
});
/** Explicit alternative fanout path. Subscribe first; no local publication plus cache publication. */
export function cacheRealtime<R extends EventRegistry>(
	realtime: Realtime,
	registry: R,
	cache: Cache,
) {
	const physical = (channel: string) => {
		authorizedChannels([channel]);
		return `realtime/${createHash("sha256").update(channel).digest("hex")}`;
	};
	return {
		async subscribe(channel: string) {
			return cache.subscribe(physical(channel), (bytes) => {
				try {
					if (bytes.length > 65536) return;
					const envelope = envelopeSchema.parse(
						JSON.parse(bytes.toString("utf8")),
					);
					if (!Object.hasOwn(registry, envelope.type)) return;
					// Validate canonical schema output without reserializing the published event.
					const parsed = registry[envelope.type].safeParse(envelope.data);
					if (!parsed.success) return;
					realtime.dispatch(channel, {
						type: envelope.type,
						body: bytes.toString("utf8"),
						bytes: bytes.length,
					});
				} catch {
					/* Corrupt external hints are dropped. */
				}
			});
		},
		async publish<K extends keyof R & string>(
			channel: string,
			type: K,
			data: z.input<R[K]>,
		) {
			const event = encodeEvent(registry, type, data);
			try {
				await cache.publish(physical(channel), event.body);
			} catch {
				throw new RealtimeError("unavailable");
			}
			return event;
		},
	};
}
