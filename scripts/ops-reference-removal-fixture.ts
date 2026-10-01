import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const root=process.cwd();const workspace=await mkdtemp(join(tmpdir(),'ops-reference-removal-'));
const adapters=await readFile(join(root,'src/lib/ops-adapters.server.ts'),'utf8');
const imports:Record<string,string[]>={jobs:['./ops-jobs.server'],storage:['#/integrations/storage/config.server','./ops-storage.server'],cache:['#/integrations/cache/config.server','#/integrations/cache/cache.server'],audit:[],webhooks:[],observability:[]};
try{
 for(const name of ['src','public','appearance','fixtures','scripts','capabilities','.agents','drizzle','drizzle.config.ts','package.json','bun.lock','tsconfig.json','vite.config.ts','components.json','biome.json','.cta.json']){try{await cp(join(root,name),join(workspace,name),{recursive:true});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
 const helperFiles:Record<string,string[]>={jobs:['src/lib/ops-jobs.server.ts','scripts/ops-jobs-fixture.ts'],storage:['src/lib/ops-storage.server.ts','scripts/ops-storage-fixture.ts','scripts/ops-storage-failure-fixture.ts']};
 for(const [removed,modules] of Object.entries(imports)){
  for(const file of Object.values(helperFiles).flat())await cp(join(root,file),join(workspace,file));
  for(const file of helperFiles[removed] ?? [])await rm(join(workspace,file));
  const source=ts.createSourceFile('ops-adapters.server.ts',adapters,ts.ScriptTarget.Latest,true);
  const transformed=ts.transform(source,[(context)=>{
   const visit:ts.Visitor=node=>{
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&modules.includes(node.moduleSpecifier.text))return undefined;
    if(ts.isArrayLiteralExpression(node))return ts.factory.updateArrayLiteralExpression(node,node.elements.filter(element=>!(ts.isObjectLiteralExpression(element)&&element.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='id'&&ts.isStringLiteral(p.initializer)&&p.initializer.text===removed))));
    return ts.visitEachChild(node,visit,context);
   };return node=>ts.visitNode(node,visit) as ts.SourceFile;
  }]);
  const printed=ts.createPrinter().printFile(transformed.transformed[0]);transformed.dispose();
  assert.ok(!printed.includes(`id: "${removed}"`));for(const module of modules)assert.ok(!printed.includes(module));
  await writeFile(join(workspace,'src/lib/ops-adapters.server.ts'),printed);
  for(const args of [['run','typecheck'],['run','build']]){
   const result=spawnSync('bun',args,{cwd:workspace,env:{...process.env,NODE_ENV:'production',BETTER_AUTH_SECRET:'ops-removal-fixture-secret-at-least-32-characters',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_BASE_URL:'http://127.0.0.1:3000'},encoding:'utf8'});
   assert.equal(result.status,0,`Ops adapter ${removed} removal ${args.join(' ')} failed: ${result.stdout.slice(-2000)}${result.stderr.slice(-2000)}`);
  }
  console.info(`Ops optional ${removed} adapter/import removal typecheck and build passed`);
 }
}finally{await rm(workspace,{recursive:true,force:true});}
