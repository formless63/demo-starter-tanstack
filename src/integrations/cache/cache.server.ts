import "@tanstack/react-start/server-only";
import { randomBytes } from "node:crypto";
import { createClient, RESP_TYPES } from "redis";
import { boundedInteger, cacheConfig, logicalName } from "./config.server";
import { CacheError, cacheError, invalid } from "./errors.server";

export { CacheError, cacheError } from "./errors.server";
export const cacheOperations = [
	"check",
	"get",
	"getBytes",
	"set",
	"setWithoutExpiry",
	"delete",
	"increment",
	"publish",
	"subscribe",
	"unsubscribe",
	"acquireLease",
	"renewLease",
	"releaseLease",
] as const;
export type CacheOperation = (typeof cacheOperations)[number];
export interface CacheSignal {
	operation: CacheOperation;
	outcome: "success" | "failure";
	durationMs: number;
	hit?: boolean;
	valueBytes?: number;
}
export type CacheObserver = (
	signal: Readonly<CacheSignal>,
) => void | Promise<void>;
export interface Lease {
	readonly name: string;
	readonly token: string;
	readonly ttlMs: number;
}
export type MessageHandler = (message: Buffer) => void | Promise<void>;

// Preserve an existing expiring counter's TTL. Attach expiry to new/non-expiring
// counters in the same atomic script. Check the safe-integer range before mutation.
const incrementScript = `
local old = redis.call('GET', KEYS[1])
local n = tonumber(old or '0')
local by = tonumber(ARGV[1])
if not n or n % 1 ~= 0 or math.abs(n) > 9007199254740991 or math.abs(n + by) > 9007199254740991 then
  return redis.error_reply('ERR cache integer out of range')
end
local result = redis.call('INCRBY', KEYS[1], ARGV[1])
if redis.call('PTTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return result`;
const renewScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end`;
const releaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

// node-redis infers the concrete RESP2 command surface.
function newClient() {
	return createClient({ RESP: 2 });
}
type Client = ReturnType<typeof newClient>;
interface Connection {
	client: Client;
	connecting?: Promise<void>;
	lastError?: unknown;
}
// No config validation or network until the first operation, including createCache().
export function createCache(
	options: { env?: NodeJS.ProcessEnv; observe?: CacheObserver } = {},
) {
	let config: ReturnType<typeof cacheConfig> | undefined;
	let main: Connection | undefined;
	let closed = false;
	let closing: Promise<void> | undefined;
	const connections = new Set<Connection>();
	const active = new Set<Promise<unknown>>();
	function settings() {
		config ??= cacheConfig(options.env);
		return config;
	}
	function key(name: string, kind: "data" | "lease" | "channel") {
		return `${settings().prefix}${kind}:${logicalName(name)}`;
	}
	function bytes(value: string | Uint8Array) {
		invalid(typeof value === "string" || value instanceof Uint8Array);
		const size =
			typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
		invalid(size <= settings().maxValueBytes);
		return Buffer.from(value);
	}
	function ttl(value?: number) {
		return boundedInteger(value ?? settings().ttlSeconds, 1, 604800);
	}
	function leaseTtl(value: number) {
		return boundedInteger(value, 100, 300000);
	}
	function token(lease: Lease) {
		invalid(
			lease !== null &&
				typeof lease === "object" &&
				typeof lease.token === "string" &&
				/^[a-f0-9]{64}$/.test(lease.token),
		);
		return lease.token;
	}
	function connection(): Connection {
		const cfg = settings();
		const client = createClient({
			url: cfg.url,
			RESP: 2,
			disableOfflineQueue: true,
			commandsQueueMaxLength: 1024,
			commandOptions: { timeout: cfg.commandTimeoutMs },
			socket: {
				...(cfg.url.startsWith("rediss:")
					? { tls: true as const, rejectUnauthorized: true }
					: { tls: false as const }),
				connectTimeout: cfg.connectTimeoutMs,
				reconnectStrategy: (retries, cause) =>
					cacheError(cause).code === "authentication" || retries >= 6
						? false
						: Math.min(100 * 2 ** retries, 1000),
			},
		});
		const result: Connection = { client };
		// Required error listener; raw client errors are never logged.
		client.on("error", (error) => {
			result.lastError = error;
		});
		connections.add(result);
		return result;
	}
	async function bound<T>(
		work: Promise<T>,
		ms: number,
		expire?: () => void,
	): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				work,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						reject(new CacheError("timeout"));
						expire?.();
					}, ms);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	}
	async function ready(conn: Connection) {
		if (closed) throw new CacheError("unavailable");
		if (conn.client.isReady) return conn.client;
		if (!conn.connecting) {
			conn.lastError = undefined;
			const waitForReady = async () => {
				while (!conn.client.isReady) {
					if (!conn.client.isOpen) throw cacheError(conn.lastError);
					await new Promise((resolve) => setTimeout(resolve, 25));
				}
			};
			const connect = conn.client.isOpen
				? waitForReady()
				: conn.client.connect().then(() => {});
			conn.connecting = bound(connect, settings().connectTimeoutMs, () => {
				if (conn.client.isOpen) conn.client.destroy();
			})
				.catch((error) => {
					throw cacheError(conn.lastError ?? error);
				})
				.finally(() => {
					conn.connecting = undefined;
				});
		}
		await conn.connecting;
		if (closed) throw new CacheError("unavailable");
		return conn.client;
	}
	async function client() {
		main ??= connection();
		return ready(main);
	}
	async function command<T>(
		run: (connection: Client) => Promise<T>,
	): Promise<T> {
		const connection = await client();
		// Client's native queue timeout ends when written. Bound response wait too;
		// teardown prevents unresolved replies accumulating or any replay.
		return bound(run(connection), settings().commandTimeoutMs, () => {
			if (connection.isOpen) connection.destroy();
		});
	}

	function operation<T>(
		name: CacheOperation,
		run: (signal: CacheSignal) => Promise<T>,
	): Promise<T> {
		const start = performance.now();
		const signal: CacheSignal = {
			operation: name,
			outcome: "success",
			durationMs: 0,
		};
		const work = (async () => {
			try {
				if (closed) throw new CacheError("unavailable");
				return await run(signal);
			} catch (error) {
				signal.outcome = "failure";
				throw cacheError(error);
			} finally {
				signal.durationMs = performance.now() - start;
				try {
					void Promise.resolve(options.observe?.(Object.freeze(signal))).catch(
						() => {},
					);
				} catch {
					/* Telemetry cannot change behavior. */
				}
			}
		})();
		active.add(work);
		void work.finally(() => active.delete(work)).catch(() => {});
		return work;
	}
	async function dispose(conn: Connection) {
		try {
			if (conn.client.isOpen)
				await bound(conn.client.close(), 2000, () => {
					if (conn.client.isOpen) conn.client.destroy();
				});
		} catch {
			if (conn.client.isOpen) conn.client.destroy();
		} finally {
			connections.delete(conn);
		}
	}
	const cache = {
		checkCache: () =>
			operation("check", async () => {
				await command((client) => client.ping());
				return { status: "ok" as const };
			}),
		get: (name: string) =>
			operation("get", async (signal) => {
				const physical = key(name, "data");
				const result = await command((client) => client.get(physical));
				signal.hit = result !== null;
				if (result !== null) signal.valueBytes = Buffer.byteLength(result);
				return result;
			}),
		getBytes: (name: string) =>
			operation("getBytes", async (signal) => {
				const physical = key(name, "data");
				const result = await command((client) =>
					client
						.withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer })
						.get(physical),
				);
				signal.hit = result !== null;
				if (result !== null) signal.valueBytes = result.byteLength;
				return result;
			}),
		set: (
			name: string,
			value: string | Uint8Array,
			opts: { ttlSeconds?: number; ifAbsent?: boolean } = {},
		) =>
			operation("set", async (signal) => {
				const physical = key(name, "data"),
					encoded = bytes(value),
					seconds = ttl(opts.ttlSeconds);
				invalid(
					opts.ifAbsent === undefined || typeof opts.ifAbsent === "boolean",
				);
				signal.valueBytes = encoded.byteLength;
				return (
					(await command((client) =>
						client.set(physical, encoded, {
							EX: seconds,
							...(opts.ifAbsent ? { NX: true } : {}),
						}),
					)) === "OK"
				);
			}),
		// Explicit escape hatch for ephemeral data whose lifetime is application-managed.
		setWithoutExpiry: (name: string, value: string | Uint8Array) =>
			operation("setWithoutExpiry", async (signal) => {
				const physical = key(name, "data"),
					encoded = bytes(value);
				signal.valueBytes = encoded.byteLength;
				await command((client) => client.set(physical, encoded));
			}),
		delete: (name: string) =>
			operation("delete", async () => {
				const physical = key(name, "data");
				return (await command((client) => client.del(physical))) === 1;
			}),
		increment: (name: string, opts: { by?: number; ttlSeconds: number }) =>
			operation("increment", async () => {
				const physical = key(name, "data"),
					by = boundedInteger(
						opts.by ?? 1,
						-Number.MAX_SAFE_INTEGER,
						Number.MAX_SAFE_INTEGER,
					),
					seconds = ttl(opts.ttlSeconds);
				invalid(opts.ttlSeconds !== undefined);
				return (await command((client) =>
					client.eval(incrementScript, {
						keys: [physical],
						arguments: [String(by), String(seconds)],
					}),
				)) as number;
			}),
		publish: (name: string, message: string | Uint8Array) =>
			operation("publish", async (signal) => {
				const channel = key(name, "channel"),
					encoded = bytes(message);
				signal.valueBytes = encoded.byteLength;
				return command((client) => client.publish(channel, encoded));
			}),
		subscribe: (name: string, handler: MessageHandler) =>
			operation("subscribe", async () => {
				const channel = key(name, "channel");
				invalid(typeof handler === "function");
				invalid(connections.size < 33);
				const conn = connection();
				let subscribed = true;
				const listener = (message: Buffer) => {
					if (
						!subscribed ||
						closed ||
						message.byteLength > settings().maxValueBytes
					)
						return;
					// Consumer owns handler error reporting; never expose message/channel in errors.
					try {
						void Promise.resolve(handler(message)).catch(() => {});
					} catch {
						/* isolated consumer */
					}
				};
				try {
					await bound(
						(await ready(conn)).subscribe(channel, listener, true),
						settings().commandTimeoutMs,
						() => {
							if (conn.client.isOpen) conn.client.destroy();
						},
					);
				} catch (error) {
					await dispose(conn);
					throw error;
				}
				let unsubscribing: Promise<void> | undefined;
				return {
					unsubscribe: () =>
						(unsubscribing ??= closed
							? Promise.resolve()
							: operation("unsubscribe", async () => {
									subscribed = false;
									try {
										if (conn.client.isReady)
											await bound(
												conn.client.unsubscribe(channel, listener, true),
												settings().commandTimeoutMs,
												() => {
													if (conn.client.isOpen) conn.client.destroy();
												},
											);
									} finally {
										await dispose(conn);
									}
								})),
				};
			}),
		acquireLease: (name: string, opts: { ttlMs: number }) =>
			operation("acquireLease", async () => {
				const physical = key(name, "lease"),
					ttlMs = leaseTtl(opts.ttlMs),
					token = randomBytes(32).toString("hex");
				const acquired = await command((client) =>
					client.set(physical, token, { NX: true, PX: ttlMs }),
				);
				return acquired === "OK" ? Object.freeze({ name, token, ttlMs }) : null;
			}),
		renewLease: (lease: Lease, opts: { ttlMs: number }) =>
			operation("renewLease", async () => {
				const ownership = token(lease),
					physical = key(lease.name, "lease"),
					ttlMs = leaseTtl(opts.ttlMs);
				const result = await command((client) =>
					client.eval(renewScript, {
						keys: [physical],
						arguments: [ownership, String(ttlMs)],
					}),
				);
				if (result !== 1) throw new CacheError("lease_not_owned");
				return Object.freeze({ ...lease, ttlMs });
			}),
		releaseLease: (lease: Lease) =>
			operation("releaseLease", async () => {
				const ownership = token(lease),
					physical = key(lease.name, "lease");
				const result = await command((client) =>
					client.eval(releaseScript, {
						keys: [physical],
						arguments: [ownership],
					}),
				);
				if (result !== 1) throw new CacheError("lease_not_owned");
			}),
		close: () =>
			(closing ??= (async () => {
				closed = true;
				// Stop pending connects/reconnects; drain commands already accepted, bounded.
				for (const conn of connections)
					if (!conn.client.isReady && conn.client.isOpen) conn.client.destroy();
				await bound(Promise.allSettled([...active]), 2000).catch(() => {});
				await Promise.all([...connections].map(dispose));
			})()),
	};
	return cache;
}
export type Cache = ReturnType<typeof createCache>;
let singleton: Cache | undefined;
export function getCache() {
	singleton ??= createCache();
	return singleton;
}
export function checkCache() {
	return getCache().checkCache();
}
export async function closeCache() {
	const cache = singleton;
	singleton = undefined;
	await cache?.close();
}
