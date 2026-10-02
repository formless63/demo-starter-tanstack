import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"capabilities/rich-text/test/**/*.fixture.ts",
        "capabilities/rich-text/test/**/*.fixture.mjs",
			"capabilities/rich-text/test/**/*.fixture.tsx",
		],
		environment: "jsdom",
		setupFiles: ["capabilities/rich-text/test/setup.ts"],
		maxWorkers: 1,
		fileParallelism: false,
		restoreMocks: true,
	},
});
