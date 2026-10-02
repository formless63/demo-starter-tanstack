import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.notEqual(pkg.name, 'tanstack-launchpad', 'Generated fixture only; root removal needs reviewed navigation/schema preservation.');
// This runs before runtime deletion, but each actual provider callback deletes File UI before its retained-object read.
const result = spawnSync('bun', ['scripts/storage-compat.ts'], { env: { ...process.env, STORAGE_SMOKE_SCRIPT: 'scripts/file-ui-retention.ts' }, stdio: 'inherit' });
assert.equal(result.status, 0);
for (const path of ['src/components/file-ui.tsx', 'src/integrations/file-ui']) await rm(path, { recursive: true, force: true });
for (const key of Object.keys(pkg.scripts)) if (key.startsWith('file-ui:')) delete pkg.scripts[key];
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
for (const path of ['scripts/file-ui-unit.ts', 'scripts/file-ui-vitest.config.ts', 'scripts/file-ui-protocol.ts', 'scripts/file-ui-storage.ts', 'scripts/file-ui-compat.ts', 'scripts/file-ui-browser.tsx', 'scripts/file-ui-example.tsx', 'scripts/file-ui-client.tsx', 'scripts/file-ui-retention.ts', 'scripts/file-ui-remove.ts']) await rm(path, { force: true });
console.info('File UI runtime removed; Object Storage retained, real marker reads proved on both providers.');
