import assert from 'node:assert/strict';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const cta=JSON.parse(await readFile('.cta.json','utf8'));assert.equal(cta.projectName,'api-platform-addon-clean-install');assert.ok(resolve('.').includes('api-platform-addon-'));
function run(args:string[]){assert.equal(spawnSync(process.execPath,args,{stdio:'inherit'}).status,0)}
const require=createRequire(import.meta.url), authRequire=createRequire(require.resolve('better-auth'));
const pluginRequire=createRequire(require.resolve('@better-auth/api-key'));
assert.equal(pluginRequire.resolve('@better-auth/core'),authRequire.resolve('@better-auth/core'),'Auth and API keys must resolve the same Better Auth core');
for(const name of ['better-auth','@better-auth/core','@better-auth/drizzle-adapter','@better-auth/api-key']){
 const entry=(name==='@better-auth/api-key'?require:authRequire).resolve(name);
 const resolved=JSON.parse(await readFile(resolve(dirname(entry),'../package.json'),'utf8'));
 assert.equal(resolved.version,'1.7.7',`${name} release must align`);
 console.info(`${name} ${resolved.version}`);
}
run(['run','db:migrate']);run(['run','api-platform:smoke']);run(['run','build']);
await rm('src/integrations/api-platform',{recursive:true});
for(const path of ['src/routes/api/v1/projects.ts','src/routes/api/openapi[.]json.ts','src/routes/docs.api.tsx','src/routes/app.api-keys.tsx','scripts/api-platform-smoke.ts'])await rm(path);
let auth=await readFile('src/lib/auth.ts','utf8');
const registration = auth.indexOf("plugins.push(");
const following = auth.indexOf("if (env.OIDC_DISCOVERY_URL",registration);
assert.ok(registration >= 0 && following > registration,"Reviewed fixture auth shape changed");
auth=auth.slice(0,registration)+auth.slice(following);
// The generated consumer's formatter may change quotes, indentation and semicolons.
const apiKeyImport=/^[ \t]*import\s*\{\s*apiKey\s*\}\s*from\s*(['"])@better-auth\/api-key\1[ \t]*;?[ \t]*\r?\n/m;
const apiKeyType=/^[ \t]*\|\s*typeof apiKey[ \t]*\r?\n/m;
assert.match(auth,apiKeyImport);
assert.match(auth,apiKeyType);
auth=auth.replace(apiKeyImport,'').replace(apiKeyType,'');
assert.doesNotMatch(auth,/\bapiKey\b|@better-auth\/api-key/);
await writeFile('src/lib/auth.ts',auth);
try {
 let app=await readFile('src/routes/app.tsx','utf8');
 app=app.replace(/<Link\s+to="\/app\/api-keys"[\s\S]*?<\/Link>/,'').replace(/\s*IconKey,/, '');
 await writeFile('src/routes/app.tsx',app);
} catch (error) {if((error as NodeJS.ErrnoException).code !== 'ENOENT')throw error}
// Retain apikey schema and all SQL/history to avoid future generated drops.
const pkg=JSON.parse(await readFile('package.json','utf8'));
for(const key of ['@better-auth/api-key','@scalar/api-reference-react','zod-openapi'])delete pkg.dependencies[key];delete pkg.devDependencies['@scalar/openapi-parser'];delete pkg.scripts['api-platform:smoke'];
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');run(['install']);
// Vite regenerates route metadata before standalone typecheck.
run(['run','build']);run(['x','tsc','--noEmit']);
console.info('API install/runtime/removal passed; credential schema and migrations retained');
