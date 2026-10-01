// Root-only composition proof on the same disposable provider stack.
import { spawnSync } from 'node:child_process';
for (const script of ['scripts/import-export-fixture.ts', 'scripts/ops-storage-fixture.ts']) {
 const result = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
 if (result.status !== 0) throw new Error(`Combined Import/Ops provider proof failed: ${script}`);
}
console.info('Combined Import cancellation/atomicity and Ops one-HEAD seams passed on the same real provider');
