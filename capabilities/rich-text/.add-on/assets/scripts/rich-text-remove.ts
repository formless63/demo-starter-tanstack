// Own disposable clean-consumer fixture only. Never a production uninstaller.
import {readFile,writeFile,rm} from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(pkg.name!=='rich-text-addon-clean-install')throw new Error('Removal requires its own disposable consumer');
for(const path of ['src/routes/rich-text-test.tsx','src/integrations/rich-text','scripts/rich-text-client.tsx','scripts/rich-text-browser.tsx','scripts/rich-text-browser-checks.ts','scripts/rich-text-remove.ts','capabilities/rich-text/CAPABILITY.md'])await rm(path,{recursive:true});
delete pkg.scripts['rich-text:browser'];
for(const name of ['@tiptap/react','@tiptap/pm','@tiptap/starter-kit'])delete pkg.dependencies[name];
for(const name of ['@playwright/test','@types/bun'])delete pkg.devDependencies[name];
await writeFile('package.json',`${JSON.stringify(pkg,null,2)}\n`);
const result=Bun.spawnSync(['bun','install'],{stdout:'inherit',stderr:'inherit'});if(result.exitCode!==0)throw new Error('Removal install failed');
