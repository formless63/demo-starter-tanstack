import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,test} from 'vitest';
test('Flow authored, compiled and installed assets remain identical',()=>{
 const compiled=JSON.parse(readFileSync('capabilities/flow-canvas/add-on.json','utf8'));
 const walk=(directory:string)=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){walk(path);continue;}const relative=path.replace('capabilities/flow-canvas/.add-on/assets/','');const text=readFileSync(path,'utf8');expect(compiled.files[relative]).toBe(text);expect(readFileSync(relative,'utf8')).toBe(text);}};
 walk('capabilities/flow-canvas/.add-on/assets');
});
test('Flow keeps browser provisioning, native root reference and scoped optimizer entry',()=>{
 const fixture=JSON.parse(readFileSync('capabilities/flow-canvas/test/clean-install.json','utf8'));
 expect(fixture.verificationCommands).toContainEqual(['bun','x','playwright','install','chromium']);expect(fixture.verificationCommands).toContainEqual(['bun','run','flow-canvas:browser']);expect(fixture.postBuildVerificationCommands).toContainEqual(['bun','scripts/flow-canvas-remove.ts']);
 expect(readFileSync('vite.config.ts','utf8')).toContain('"@xyflow/react"');expect(readFileSync('vite.config.ts','utf8')).toContain('noDiscovery: true');expect(readFileSync('src/routes/flow-test.tsx','utf8')).toContain('FlowExample');
 expect(readFileSync('.github/workflows/ci.yml','utf8')).toContain('bun run flow-canvas:dom');
});
