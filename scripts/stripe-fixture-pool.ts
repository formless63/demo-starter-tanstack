interface FixturePool {
	on(event: "connect", listener: (client: FixtureClient) => void): unknown;
	end(): Promise<void>;
}
interface FixtureClient {
	once(event: "end", listener: () => void): unknown;
}

/** Register before the first checkout; pg-pool can resolve end() before sockets close. */
export function trackFixturePool(pool: FixturePool, timeoutMs = 10_000): () => Promise<void> {
	const connections = new Set<Promise<void>>();
	pool.on("connect", (client) => {
		const closed = new Promise<void>((resolve) => {
			client.once("end", () => {
				connections.delete(closed);
				resolve();
			});
		});
		connections.add(closed);
	});
	return async () => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				(async () => {
					await pool.end();
					// Include clients removed by idle expiry before end() began.
					await Promise.all(connections);
				})(),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(() => {
						reject(new Error("Timed out closing fixture database connections"));
					}, timeoutMs);
				}),
			]);
		} finally {
			clearTimeout(timeout);
		}
	};
}
