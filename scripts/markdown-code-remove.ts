import { rm,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Generated consumer fixture only. Application-owned routes must be removed first.
if (JSON.parse(await readFile('package.json','utf8')).name !== 'markdown-code-clean-install') throw new Error('Removal fixture refuses non-fixture applications');
for (const path of ['scripts/markdown-code-production.mjs','src/routes/markdown-fixture.tsx','scripts/markdown-code-fixture-route.ts','src/integrations/markdown-code','scripts/markdown-code-browser.tsx','scripts/markdown-code-client.tsx','scripts/markdown-code-example.tsx','scripts/markdown-code-unit.tsx','capabilities/markdown-code']) await rm(resolve(path),{recursive:true,force:true});
const file = JSON.parse(await readFile('package.json','utf8'));
for (const key of Object.keys(file.scripts)) if(key.startsWith('markdown-code:')) delete file.scripts[key];
for (const key of ['markdown-it','shiki']) delete file.dependencies[key];
// This guarded blank consumer owns the test-only dependency; real applications keep shared Playwright.
delete file.devDependencies['@playwright/test'];
await writeFile('package.json',`${JSON.stringify(file,null,2)}\n`);
const child = spawnSync('bun',['install'],{stdio:'inherit'});
if (child.status !== 0) throw new Error('Removal install failed');
await rm(fileURLToPath(import.meta.url));
