import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['capabilities/flow-canvas/test/**/*.fixture.tsx'],environment:'jsdom'}});
