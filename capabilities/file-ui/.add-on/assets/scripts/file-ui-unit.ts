import { spawnSync } from 'node:child_process';
const result = spawnSync('bun', ['x', 'vitest', 'run', '--config', 'scripts/file-ui-vitest.config.ts'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
