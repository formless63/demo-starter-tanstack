import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["capabilities/data-table/test/**/*.fixture.tsx"],environment:"jsdom"}});
