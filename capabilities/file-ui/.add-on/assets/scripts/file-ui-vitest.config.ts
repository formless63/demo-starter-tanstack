import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/integrations/file-ui/workflow.test.ts'], environment: 'node' } });
