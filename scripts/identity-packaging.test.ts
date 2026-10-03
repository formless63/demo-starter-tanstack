import {readFile,readdir} from 'node:fs/promises';
import {expect,test} from 'vitest';
const ids=['organizations','authorization','feature-flags'] as const;
for(const id of ids)test(`${id}: independent authoritative source, retained distribution and catalog agree`,async()=>{
 const base=`capabilities/${id}`,compiled=JSON.parse(await readFile(`${base}/add-on.json`,'utf8')),manifest=JSON.parse(await readFile(`${base}/.add-on/info.json`,'utf8'));
 const paths=[`capabilities/${id}/CAPABILITY.md`,...((await readdir(`src/integrations/${id}`)).filter(file=>!file.endsWith('.test.ts')).map(file=>`src/integrations/${id}/${file}`)),...((await readdir(`${base}/test`)).filter(file=>file!=='clean-install.json').map(file=>`${base}/test/${file}`))];
 for(const path of paths){const source=await readFile(path,'utf8');expect(await readFile(`${base}/.add-on/assets/${path}`,'utf8')).toBe(source);expect(compiled.files[path]).toBe(source);}
 const catalog=JSON.parse(await readFile('capabilities/catalog.json','utf8')).capabilities.find((entry:{id:string})=>entry.id===id);expect(catalog.defaultInstalled).toBe(false);expect(catalog.requires).toEqual([]);expect(manifest.dependsOn).toEqual(id==='feature-flags'?['drizzle']:['better-auth','drizzle']);
 const runtime=paths.filter(path=>path.startsWith('src/integrations/'));for(const path of runtime){const source=await readFile(path,'utf8');for(const other of [...ids,'audit-log','notifications','api-platform'])if(other!==id)expect(source).not.toMatch(new RegExp(`from ["'][^"']*integrations/${other}/`));}
});
