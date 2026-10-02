import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["capabilities/markdown-code/test/**/*.fixture.tsx"],environment:"jsdom"}});
