import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { applyTheme } from './lib/theme.ts';
import { checkProject, loadProject, projectStatus } from './lib/project.ts';
import { configSchema, sourcesSchema, skillsSchema, validateTheme } from './lib/project-contracts.ts';
const repository = resolve(import.meta.dirname,'..');
const temporary: string[] = [];
afterEach(()=>{for(const root of temporary.splice(0)) rmSync(root,{recursive:true,force:true});});
export function fixture() {
 const root=mkdtempSync(resolve(tmpdir(),'project-bootstrap-'));temporary.push(root);
 cpSync(resolve(repository,'fixtures/project-bootstrap'),root,{recursive:true});
 for(const path of ['appearance','.agents/schemas','docs/templates/project','scripts/project.ts','.agents/skills/project-onboarding','.agents/prompts/onboard-project.md','capabilities/catalog.json']) {
  mkdirSync(resolve(root,path,'..'),{recursive:true});cpSync(resolve(repository,path),resolve(root,path),{recursive:true});
 }
 applyTheme(root);
 return root;
}
function change(root:string,file:string,edit:(data:any)=>void) {
 const path=resolve(root,`.project/${file}.json`);const data=JSON.parse(readFileSync(path,'utf8'));edit(data);writeFileSync(path,JSON.stringify(data));
}
describe('project bootstrap contract',()=>{
 test('valid downstream profile, deferred plan, installed skills and read-only drift summary',()=>{
  const root=fixture();expect(checkProject(root)).toEqual([]);expect(loadProject(root)?.capabilities.deferred).toEqual(['realtime']);
  const before=readFileSync(resolve(root,'.project/config.json'),'utf8');expect(projectStatus(root)).toContain('Skills: 2 installed; 4 reviewed');expect(projectStatus(root)).toContain('Enablement drift:');expect(readFileSync(resolve(root,'.project/config.json'),'utf8')).toBe(before);
 });
 test('reference uninitialized still validates tooling',()=>{const root=fixture();rmSync(resolve(root,'.project'),{recursive:true});applyTheme(root);expect(checkProject(root)).toEqual([]);expect(projectStatus(root)).toContain('uninitialized');rmSync(resolve(root,'docs/templates/project/PROJECT.md'));expect(checkProject(root)).toContain('Missing PROJECT template.');});
 test.each([
  ['unknown ID',(d:any)=>d.capabilities.selected.push('unknown-id'),'Unknown capability'],
  ['planned selected',(d:any)=>{d.capabilities.selected.push('realtime');d.capabilities.deferred=[];},'not implemented'],
  ['overlap',(d:any)=>d.capabilities.deferred.push('jobs'),'overlapping'],
  ['duplicate',(d:any)=>d.capabilities.selected.push('jobs'),'duplicate'],
  ['hard dependency',(d:any)=>d.capabilities.selected=d.capabilities.selected.filter((id:string)=>id!=='jobs'),'hard dependency'],
  ['missing document',(d:any)=>d.documents.spec='missing.md','document'],
  ['absolute POSIX',(d:any)=>d.documents.project='/Users/private/PROJECT.md','schema'],
  ['absolute Windows',(d:any)=>d.documents.project='C:\\Users\\private\\PROJECT.md','schema'],
  ['escape',(d:any)=>d.documents.project='../PROJECT.md','schema'],
  ['system requires both',(d:any)=>d.appearance.colorMode.supported=['dark'],'color mode'],
  ['unsupported default',(d:any)=>{d.appearance.colorMode.supported=['light'];d.appearance.colorMode.default='dark';},'color mode'],
 ])('rejects %s',(_label,edit,message)=>{const root=fixture();change(root,'config',edit);expect(()=>loadProject(root)).toThrow(message);});
 test('null unnecessary documents are valid; symlink escape fails',()=>{
  const root=fixture();change(root,'config',d=>d.documents.project=null);expect(checkProject(root)).toEqual([]);
  symlinkSync(resolve(repository,'README.md'),resolve(root,'escape.md'));change(root,'config',d=>d.documents.project='escape.md');expect(()=>loadProject(root)).toThrow('document');
 });
 test('repository source must exist and errors do not echo secret URLs',()=>{
  const root=fixture();change(root,'sources',d=>d.entries[0].path='missing.md');expect(()=>loadProject(root)).toThrow('Source file');
  cpSync(resolve(repository,'fixtures/project-bootstrap/.project/sources.json'),resolve(root,'.project/sources.json'));
  for(const url of ['https://example.com/?token=DO_NOT_ECHO','https://user:DO_NOT_ECHO@example.com/','file:///Users/DO_NOT_ECHO','https://localhost/private']) {
   change(root,'sources',d=>d.entries[2].url=url);let message='';try{loadProject(root);}catch(e){message=(e as Error).message;}expect(message).toBeTruthy();expect(message).not.toContain('DO_NOT_ECHO');
  }
 });
 test.each(['conflict','unsafe','redundant','irrelevant'])('cannot install %s skills',classification=>{const root=fixture();change(root,'skills',d=>d.entries[0].classification=classification);expect(()=>loadProject(root)).toThrow('explicit approval');});
 test('duplicates, missing canonical skills, unapproved and mismatched adaptations fail',()=>{
  const root=fixture();change(root,'skills',d=>d.entries.push(d.entries[0]));expect(()=>loadProject(root)).toThrow('Duplicate skill');
  cpSync(resolve(repository,'fixtures/project-bootstrap/.project/skills.json'),resolve(root,'.project/skills.json'));change(root,'skills',d=>d.entries[0].approved=false);expect(()=>loadProject(root)).toThrow('explicit approval');
  change(root,'skills',d=>{d.entries[0].approved=true;d.entries[1].decision='accepted';});expect(()=>loadProject(root)).toThrow('mismatch');
  change(root,'skills',d=>d.entries[1].decision='adapted');rmSync(resolve(root,'.agents/skills/bun-workflow/SKILL.md'));expect(()=>loadProject(root)).toThrow('SKILL.md');
 });
 test('versioned strict schemas reject unknown metadata; complete theme validates',()=>{
  expect(configSchema.safeParse({schemaVersion:2}).success).toBe(false);expect(sourcesSchema.safeParse({schemaVersion:1,entries:[],hooks:[]}).success).toBe(false);expect(skillsSchema.safeParse({schemaVersion:1,entries:[],permissions:{}}).success).toBe(false);
  const theme=JSON.parse(readFileSync(resolve(repository,'fixtures/project-bootstrap/.project/theme.json'),'utf8'));expect(validateTheme(theme).tokens.dark).toEqual(theme.tokens.dark);
 });
});
