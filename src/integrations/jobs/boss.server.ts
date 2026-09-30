import { type ConstructorOptions, PgBoss } from "pg-boss";

const SCHEMA_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function jobsDatabaseUrl() {
	const value = process.env.PGBOSS_DATABASE_URL ?? process.env.DATABASE_URL;
	if (!value) {
		throw new Error("PGBOSS_DATABASE_URL or DATABASE_URL is required");
	}
	return value;
}

export function jobsSchema() {
	const value = process.env.PGBOSS_SCHEMA ?? "pgboss";
	if (!SCHEMA_PATTERN.test(value)) {
		throw new Error("PGBOSS_SCHEMA must be a valid PostgreSQL identifier");
	}
	return value;
}

export function createJobsBoss(overrides: Partial<ConstructorOptions> = {}) {
	const boss = new PgBoss({
		connectionString: jobsDatabaseUrl(),
		migrate: false,
		schema: jobsSchema(),
		useListenNotify: process.env.PGBOSS_USE_LISTEN_NOTIFY === "true",
		...overrides,
	});
	boss.on("error", (error) => {
		console.error(
			JSON.stringify({
				event: "jobs.error",
				error: error instanceof Error ? error.name : "Error",
			}),
		);
	});
	return boss;
}
