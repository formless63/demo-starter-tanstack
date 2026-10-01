import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	environments: {
		client: {
			// Prevent late auth/docs discovery from replacing shared chunks during hydration.
			optimizeDeps: {
				include: [
					"better-auth/react",
					"better-auth/client/plugins",
					"@scalar/api-reference-react",
					"zod",
				],
			},
		},
	},
	plugins: [nitro(), devtools(), tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
