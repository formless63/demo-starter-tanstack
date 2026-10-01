import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required for explicit Drizzle commands");
export default defineConfig({
	out: "./drizzle",
	schema: ["./src/db/schema.ts", "./src/integrations/import-export/schema.ts"],
	dialect: "postgresql",
	dbCredentials: { url: databaseUrl },
});
