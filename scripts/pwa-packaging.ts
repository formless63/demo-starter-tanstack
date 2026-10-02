import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtemp,readFile,rm,stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const manifestPath=join(root,'capabilities/pwa-offline/add-on.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8')) as {files:Record<string,string>};
const directory=await mkdtemp(join(tmpdir(),'pwa-offline-packaging-'));
const target=join(directory,'consumer');
const server=createServer((_request,response)=>response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(manifest)));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/pwa-offline.json`;
try {
 // Exercise the official blank-consumer filter; a manifest-only parity assertion missed example.tsx.
 const child=spawn(process.execPath,[join(root,'node_modules/@tanstack/cli/dist/bin.js'),'create','pwa-offline-packaging','--target-dir',target,'--framework','React','--blank','--no-install','--no-git','--no-intent','--toolchain','biome','--package-manager','bun','--add-ons',url,'--yes'],{cwd:directory,stdio:'inherit',env:{...process.env,XDG_CONFIG_HOME:join(directory,'config'),TANSTACK_CLI_TELEMETRY_DISABLED:'1'}});
 const status=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code ?? 1));});
 assert.equal(status,0,'Official no-install blank scaffold succeeds');
 for(const [path,content] of Object.entries(manifest.files)) {
  assert.ok((await stat(join(target,path))).isFile(),`Blank consumer retains declared asset ${path}`);
  if(content.startsWith('base64::'))assert.deepEqual(await readFile(join(target,path)),Buffer.from(content.slice(8),'base64'),'Binary public asset bytes survive official scaffolding');
  if(!/\.[cm]?[jt]sx?$/.test(path))continue;
  for(const statement of ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true).statements) {
   if(!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.startsWith('.'))continue;
   const specifier=statement.moduleSpecifier.text;
   const base=resolve(target,dirname(path),specifier);
   const candidates=[base,...['.ts','.tsx','.js','.mjs'].map(extension=>base+extension)];
   const found=await Promise.all(candidates.map(candidate=>stat(candidate).then(value=>value.isFile()).catch(()=>false)));
   assert.ok(found.some(Boolean),`${path} imports a file retained by the official blank scaffold: ${specifier}`);
  }
 }
 assert.match(await readFile(join(target,'src/integrations/pwa-offline/config.ts'),'utf8'),/publicOfflinePaths:\s*\[\] as string\[\]/,'Generated consumers default to no offline fallback routes');
 console.info('Official blank no-install scaffold retains every declared PWA asset and relative import');
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
