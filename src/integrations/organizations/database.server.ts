import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
// Dedicated lazy native-auth pool: bounds actual I/O without changing the shared
// application pool. Construction validates no network/data and never migrates.
export function createBoundedOrganizationAuthDatabase<
	TSchema extends Record<string, unknown>,
>(connectionString: string, schema: TSchema) {
	const pool = new Pool({
		connectionString,
		options: "-c statement_timeout=5000 -c lock_timeout=2000",
		connectionTimeoutMillis: 5000,
	});
	return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
