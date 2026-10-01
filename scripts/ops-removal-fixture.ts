import {rmSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Only generated consumer fixtures may execute this destructive code-removal proof.
if(!process.cwd().includes('ops-addon-clean-install'))throw new Error('Disposable fixture required');
for(const path of ['src/integrations/ops-admin','src/lib/ops.server.ts','src/lib/ops-adapters.server.ts','src/routes/admin.ops.tsx','src/routes/api/ops','scripts/ops-removal-fixture.ts','scripts/ops-consumer-fixture.ts'])rmSync(path,{recursive:true,force:true});
const pkg=JSON.parse(readFileSync('package.json','utf8'));delete pkg.scripts['ops:unit'];writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
rmSync('src/routeTree.gen.ts',{force:true});
const result=spawnSync('bun',['run','build'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status ?? 1);
