import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { applyTheme, checkTheme, fetchThemeJson, importTheme, maxThemeBytes, normalizeTheme, parseThemeInput, publicAddress, renderPolicy, renderThemeCss, validateMode } from './lib/theme.ts';
import { tokenKeys, validateTheme } from './lib/project-contracts.ts';
import { checkProject, projectStatus } from './lib/project.ts';
const repository=resolve(import.meta.dirname,'..');
const fallback=validateTheme(JSON.parse(readFileSync(resolve(repository,'appearance/default-theme.json'),'utf8')));
const fixtureItem=JSON.parse(readFileSync(resolve(repository,'fixtures/project-bootstrap/input/tweakcn-modern-minimal.json'),'utf8'));
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true});});
function fixture() {
 const root=mkdtempSync(resolve(tmpdir(),'theme-fixture-'));roots.push(root);
 cpSync(resolve(repository,'fixtures/project-bootstrap'),root,{recursive:true});
 for(const path of ['appearance','.agents/schemas','docs/templates/project','scripts/project.ts','.agents/skills/project-onboarding','.agents/prompts/onboard-project.md','capabilities/catalog.json']) {
  mkdirSync(resolve(root,path,'..'),{recursive:true});cpSync(resolve(repository,path),resolve(root,path),{recursive:true});
 }
 const configPath=resolve(root,'.project/config.json');const config=JSON.parse(readFileSync(configPath,'utf8'));config.appearance.theme={source:fallback.source.type,name:fallback.name,reference:fallback.source.reference,file:'.project/theme.json'};writeFileSync(configPath,JSON.stringify(config));writeFileSync(resolve(root,'.project/theme.json'),JSON.stringify(fallback));
 mkdirSync(resolve(root,'src'),{recursive:true});writeFileSync(resolve(root,'src/styles.css'),'/* unrelated style must survive */\n');
 return root;
}
describe('safe semantic theme import',()=>{
 test('normalized theme preserves provenance and all required mode tokens',()=>{
  expect(normalizeTheme(fallback,fallback,'input/other.json')).toEqual(fallback);
  for(const mode of ['light','dark'] as const) expect(Object.keys(fallback.tokens[mode]).sort()).toEqual([...tokenKeys].sort());
 });
 test('local TweakCN-shaped registry normalization uses only reviewed token data',()=>{
  const input=structuredClone(fixtureItem);input.css={'body':{background:'url(https://untrusted.example/track)'}};input.files=[{path:'../../pwn.ts',content:'throw new Error()'}];input.dependencies=['untrusted'];input.scripts=['curl bad | sh'];input.hooks={afterInstall:'rm -rf /'};
  const theme=normalizeTheme(input,fallback,'input/tweakcn-modern-minimal.json','tweakcn');expect(theme.source).toEqual({type:'tweakcn',reference:'input/tweakcn-modern-minimal.json'});
  expect(theme.tokens.light.primary).toBe(input.cssVars.light.primary);expect(theme.tokens.dark.background).toBe(input.cssVars.dark.background);
  const css=renderThemeCss(theme);expect(css).not.toMatch(/untrusted|pwn|throw|rm -rf|tracking-tighter|shadow-opacity/);
  expect(theme.tokens.light['font-sans']).toBe('Inter, sans-serif');expect(css).toContain('--chart-5:');expect(css).toContain('--sidebar-ring:');
 });
 test('generic registry fills missing reviewed tokens and common fonts in both maps',()=>{
  const theme=normalizeTheme({name:'tiny',type:'registry:style',cssVars:{theme:{'font-mono':'monospace'},light:{background:'#ffffff',foreground:'#000000'},dark:{background:'#000000',foreground:'#ffffff'}}},fallback,'input/generic.json');
  expect(theme.tokens.light['font-mono']).toBe('monospace');expect(theme.tokens.dark['font-mono']).toBe('monospace');expect(Object.keys(theme.tokens.dark)).toHaveLength(tokenKeys.length);
 });
 test.each([
  ['type',(d:any)=>d.type='registry:component'],
  ['key',(d:any)=>d.cssVars.light['unknown-token']='#fff'],
  ['key injection',(d:any)=>d.cssVars.dark['background;body{}']='#fff'],
  ['CSS value',(d:any)=>d.cssVars.light.primary='red; @import "bad";'],
  ['URL value',(d:any)=>d.cssVars.dark.background='url(https://bad.example/)'],
  ['missing dark',(d:any)=>delete d.cssVars.dark],
  ['malformed color',(d:any)=>d.cssVars.dark.background='oklch(nope)'],
 ])('rejects %s',(_label,edit)=>{const input=structuredClone(fixtureItem);edit(input);expect(()=>normalizeTheme(input,fallback,'input/theme.json')).toThrow();});
 test('bounded byte parsing rejects oversize, malformed JSON and UTF-8',()=>{
  expect(()=>parseThemeInput(new Uint8Array(maxThemeBytes+1))).toThrow('128 KiB');expect(()=>parseThemeInput(new TextEncoder().encode('{invalid'))).toThrow('JSON');expect(()=>parseThemeInput(new Uint8Array([0xff]))).toThrow('UTF-8');
 });
 test('required tokens and invalid normalized fonts/shadows/paths fail',()=>{
  const input=structuredClone(fallback);delete (input.tokens.light as Partial<typeof input.tokens.light>).ring;expect(()=>validateTheme(input)).toThrow('structure');
  for(const [key,value] of [['font-sans','font;evil()'],['shadow-sm','2px url(bad)'],['radius','calc(1px + 2px)']]) {
   const data=structuredClone(fallback);data.tokens.light[key as keyof typeof data.tokens.light]=value;expect(()=>validateTheme(data)).toThrow('CSS');
  }
  const bad=structuredClone(fallback);bad.source.reference='/Users/private/theme.json';expect(()=>validateTheme(bad)).toThrow('provenance');
 });
 test('import is vendored separately; generation/check is deterministic and preserves general styles',async()=>{
  const root=fixture();applyTheme(root);expect(checkTheme(root)).toEqual([]);
  const cssBefore=readFileSync(resolve(root,'src/theme.css'),'utf8');const styles=readFileSync(resolve(root,'src/styles.css'),'utf8');
  const theme=await importTheme(root,'input/tweakcn-modern-minimal.json','tweakcn');expect(readFileSync(resolve(root,'src/theme.css'),'utf8')).toBe(cssBefore);
  const path=resolve(root,'.project/config.json');const config=JSON.parse(readFileSync(path,'utf8'));config.appearance.theme={source:theme.source.type,name:theme.name,reference:theme.source.reference,file:'.project/theme.json'};writeFileSync(path,JSON.stringify(config));
  expect(checkTheme(root).join()).toContain('drift');applyTheme(root);expect(checkTheme(root)).toEqual([]);expect(checkProject(root)).toEqual([]);expect(projectStatus(root)).toContain('theme=modern-minimal; mode=system');
  expect(readFileSync(resolve(root,'src/styles.css'),'utf8')).toBe(styles);const generated=readFileSync(resolve(root,'src/theme.css'),'utf8');expect(generated).toBe(renderThemeCss(theme));expect(generated).toContain('.dark {');applyTheme(root);expect(readFileSync(resolve(root,'src/theme.css'),'utf8')).toBe(generated);
  writeFileSync(resolve(root,'src/theme.css'),generated+'/* drift */');expect(checkTheme(root).join()).toContain('drift');expect(checkProject(root).join()).toContain('drift');
 });
 test('managed writes reject symlink escape',()=>{const root=fixture();const outside=mkdtempSync(resolve(tmpdir(),'theme-outside-'));roots.push(outside);rmSync(resolve(root,'src'),{recursive:true});symlinkSync(outside,resolve(root,'src'));expect(()=>applyTheme(root)).toThrow('escapes');});
 test('light-only/dark-only policies ignore unsupported choices; default system requires both',()=>{
  expect(validateMode({supported:['dark'],default:'dark',userSelectable:false}).default).toBe('dark');expect(()=>validateMode({supported:['light'],default:'system',userSelectable:true})).toThrow('policy');expect(renderPolicy({supported:['light'],default:'light',userSelectable:false})).toContain('userSelectable: false');
 });
 test('remote fetch uses bounded public JSON, screens addresses, and ignores redirects to private URLs',async()=>{
  const resolver=(async()=>[{address:'93.184.216.34',family:4}]) as any;
  const fetcher=(async()=>new Response(JSON.stringify(fixtureItem))) as typeof fetch;
  expect(await fetchThemeJson('https://themes.example.com/theme.json',fetcher,resolver)).toEqual(fixtureItem);
  expect(publicAddress('127.0.0.1')).toBe(false);expect(publicAddress('10.0.0.1')).toBe(false);expect(publicAddress('::1')).toBe(false);expect(publicAddress('2606:4700::1111')).toBe(true);
  for(const fetcher of [(async()=>new Response(new Uint8Array(maxThemeBytes+1))),(async()=>new Response('',{status:302,headers:{location:'https://localhost/private?token=NEVER_ECHO'}}))]) {
   await expect(fetchThemeJson('https://themes.example.com/theme.json',fetcher as typeof fetch,resolver)).rejects.toThrow('Theme fetch failed');
  }
  await expect(fetchThemeJson('https://themes.example.com/theme.json',fetcher,(async()=>[{address:'192.168.1.1',family:4}]) as any)).rejects.toThrow('public HTTPS');
 });
});

test('real CLI fixture imports, applies, checks and summarizes without network',()=>{
 const root=fixture();
 const run=(script:string,args:string[])=>spawnSync('bun',[resolve(repository,`scripts/${script}.ts`),...args],{cwd:root,encoding:'utf8'});
 const imported=run('theme',['import','--','input/tweakcn-modern-minimal.json','--kind','tweakcn']);expect(imported.status).toBe(0);expect(imported.stdout).toContain('modern-minimal');
 const profilePath=resolve(root,'.project/config.json');const config=JSON.parse(readFileSync(profilePath,'utf8'));config.appearance.theme={source:'tweakcn',name:'modern-minimal',reference:'input/tweakcn-modern-minimal.json',file:'.project/theme.json'};writeFileSync(profilePath,JSON.stringify(config));
 for(const [script,args] of [['theme',['apply']],['theme',['check']],['project',['check']],['project',['status']]] as [string,string[]][]) {
  const result=run(script,args);expect(result.stderr).toBe('');expect(result.status).toBe(0);
  if(script==='project')expect(result.stdout).toContain('Field Notes');
 }
});
test('dangling output symlink is rejected',()=>{
 const root=fixture();symlinkSync(resolve(root,'../must-not-create.css'),resolve(root,'src/theme.css'));expect(()=>applyTheme(root)).toThrow('symlink');
});
