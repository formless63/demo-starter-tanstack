import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { configSchema, sourcesSchema, skillsSchema, schemaFiles, relativePath, safePublicUrl, safeReference, validateTheme, type ProjectConfig } from './project-contracts.ts';

export function readJson(root: string, path: string): unknown {
 const file = resolve(root,path);
 if (!repositoryFile(root,path)) throw new Error('JSON reference must be a repository file.');
 try {
  if (statSync(file).size > 512*1024) throw new Error();
  return JSON.parse(readFileSync(file,'utf8'));
 } catch { throw new Error('Cannot read bounded project JSON.'); }
}
export function repositoryFile(root: string, path: string): boolean {
 if (!relativePath.safeParse(path).success || /(?:^|\/)\.env(?:$|\.)(?!example$|sample$)/.test(path)) return false;
 try {
  const actual = realpathSync(resolve(root,path));
  return actual.startsWith(realpathSync(root)+sep) && statSync(actual).isFile();
 } catch { return false; }
}
function parse<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
 const result = schema.safeParse(input);
 if (!result.success) throw new Error(`Invalid ${label} schema. Check field types, allowed keys, and relative paths.`);
 return result.data;
}
interface Catalog {capabilities: {id:string; status:string; requires:string[]}[]; referenceApplication: {enabledCapabilities:string[]}}
export function loadProject(root: string): ProjectConfig | null {
 if (!existsSync(resolve(root,'.project/config.json'))) return null;
 const config = parse(configSchema,readJson(root,'.project/config.json'),'config');
 const sources = parse(sourcesSchema,readJson(root,'.project/sources.json'),'sources');
 const skills = parse(skillsSchema,readJson(root,config.skills.manifest),'skills');
 const catalog = readJson(root,'capabilities/catalog.json') as Catalog;
 const seen = new Set<string>();
 for (const [state,ids] of Object.entries(config.capabilities)) for (const id of ids) {
  if (seen.has(id)) throw new Error('Capability states contain duplicate or overlapping IDs.');
  seen.add(id);
  const capability = catalog.capabilities.find(item => item.id === id);
  if (!capability) throw new Error('Unknown capability ID.');
  if (state === 'selected') {
   if (capability.status !== 'done') throw new Error('Selected capability is not implemented. Defer planned work.');
   if (capability.requires.some(required => !config.capabilities.selected.includes(required))) throw new Error('Selected capability lacks a selected hard dependency.');
  }
 }
 const mode = config.appearance.colorMode;
 if (new Set(mode.supported).size !== mode.supported.length || (mode.default === 'system' ? mode.supported.length !== 2 : !mode.supported.includes(mode.default))) throw new Error('Incoherent supported/default color mode policy.');
 for (const path of Object.values(config.documents)) if (path !== null && !repositoryFile(root,path)) throw new Error('Referenced project document is missing or outside the repository.');
 if (!repositoryFile(root,config.skills.manifest) || !repositoryFile(root,config.appearance.theme.file)) throw new Error('Project manifest/theme must be a repository file.');
 const sourceIds = new Set<string>();
 for (const entry of sources.entries) {
  if (sourceIds.has(entry.id)) throw new Error('Duplicate source ID.');
  sourceIds.add(entry.id);
  if (entry.path && !repositoryFile(root,entry.path)) throw new Error('Source file is missing or outside the repository.');
  if (entry.url && !safePublicUrl(entry.url)) throw new Error('Source URL must be public HTTPS without credentials, queries, or fragments.');
  if (entry.reference && !safeReference(entry.reference)) throw new Error('Source reference must be a relative material label/path or public URL.');
  if ((entry.type === 'repository-file' && !entry.path) || (entry.type === 'public-url' && !entry.url) || (!entry.path && !entry.url && !entry.reference)) throw new Error('Source entry lacks its required provenance.');
 }
 const names = new Set<string>();
 for (const skill of skills.entries) {
  if (names.has(skill.name)) throw new Error('Duplicate skill name.');
  names.add(skill.name);
  if (!sourceIds.has(skill.source)) throw new Error('Skill provenance source is missing.');
  const installed = skill.decision === 'accepted' || skill.decision === 'adapted';
  if (installed && (!skill.approved || !['compatible','adapt','project-specific'].includes(skill.classification))) throw new Error('Skill installation requires explicit approval and a compatible review.');
  if ((skill.classification === 'adapt' && skill.decision === 'accepted') || (skill.decision === 'adapted' && skill.classification !== 'adapt')) throw new Error('Adapted skill review/decision mismatch.');
  if (installed) {
   if (skill.installedPath !== `.agents/skills/${skill.name}/SKILL.md` || !repositoryFile(root,skill.installedPath)) throw new Error('Installed canonical SKILL.md is missing or invalid.');
  } else if (skill.installedPath !== null) throw new Error('Rejected/deferred skill cannot be marked installed.');
 }
 const theme = validateTheme(readJson(root,config.appearance.theme.file));
 const selectedTheme = config.appearance.theme;
 if (theme.name !== selectedTheme.name || theme.source.type !== selectedTheme.source || theme.source.reference !== selectedTheme.reference) throw new Error('Appearance profile and normalized theme provenance differ.');
 return config;
}
export function checkProject(root: string): string[] {
 const errors: string[] = [];
 try {
  for (const [file,schema] of Object.entries(schemaFiles)) {
   const expected = z.toJSONSchema(schema);
   if (JSON.stringify(readJson(root,`.agents/schemas/${file}`)) !== JSON.stringify(expected)) errors.push(`Bootstrap schema drift: ${file}`);
  }
  for (const name of ['PROJECT','SPEC','DESIGN']) if (!repositoryFile(root,`docs/templates/project/${name}.md`)) errors.push(`Missing ${name} template.`);
  for (const path of ['scripts/project.ts','.agents/skills/project-onboarding/SKILL.md','.agents/prompts/onboard-project.md']) if (!repositoryFile(root,path)) errors.push('Missing bootstrap tooling/guidance.');
  loadProject(root);
 } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid project metadata.'); }
 return errors;
}
export function projectStatus(root: string, session = false): string {
 const config = loadProject(root);
 if (!config) return 'Project: uninitialized (reference starter).';
 const mode = config.appearance.colorMode;
 const lines = [`Project: ${config.project.name}`, `Capabilities: ${config.capabilities.selected.join(', ') || 'none'}`, `Appearance: theme=${config.appearance.theme.name}; mode=${mode.default}`];
 if (session) return lines.map(line=>line.slice(0,200)).join('\n');
 const catalog = readJson(root,'capabilities/catalog.json') as Catalog;
 const selected = config.capabilities.selected;
 const enabled = catalog.referenceApplication.enabledCapabilities;
 const drift = [...new Set([...selected,...enabled])].filter(id=>selected.includes(id)!==enabled.includes(id));
 const skills = parse(skillsSchema,readJson(root,config.skills.manifest),'skills');
 lines.splice(1,0,`Documents: ${Object.entries(config.documents).map(([name,path])=>`${name}=${path ?? 'unnecessary'}`).join('; ')}`);
 lines.push(`Deferred: ${config.capabilities.deferred.join(', ') || 'none'}`, `Skills: ${skills.entries.filter(skill=>skill.installedPath).length} installed; ${skills.entries.length} reviewed`, `Enablement drift: ${drift.join(', ') || 'none'}`);
 return lines.join('\n');
}
