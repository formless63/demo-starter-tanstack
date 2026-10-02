import { spawnSync } from 'node:child_process';
const command = spawnSync('bun', ['scripts/storage-compat.ts'], { env: { ...process.env, STORAGE_SMOKE_SCRIPT: 'scripts/file-ui-storage.ts' }, stdio: 'inherit' });
if (command.status !== 0) process.exit(command.status ?? 1);
