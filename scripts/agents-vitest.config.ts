import { defineConfig } from "vitest/config";

// Hook fixtures need no application Vite plugins, services or listening sockets.
export default defineConfig({
	test: { include: ["scripts/agent-hooks.test.ts"] },
});
