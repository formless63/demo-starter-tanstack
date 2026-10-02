import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "#": new URL("./src", import.meta.url).pathname, "@": new URL("./src", import.meta.url).pathname } }, test: { environment: "node", exclude: ["e2e/**", "capabilities/**", "node_modules/**", ".output/**"] } });
