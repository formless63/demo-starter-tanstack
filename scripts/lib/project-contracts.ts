import { z } from 'zod';

export const colorTokens = [
 'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring',
 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'sidebar', 'sidebar-foreground',
 'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
] as const;
export const fontTokens = ['font-sans', 'font-serif', 'font-mono'] as const;
export const shadowTokens = ['shadow-2xs', 'shadow-xs', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl'] as const;
export const tokenKeys = [...colorTokens, 'radius', ...fontTokens, 'tracking-normal', 'spacing', ...shadowTokens] as const;
const text = z.string().min(1).max(500).regex(/^[^\x00-\x1f\x7f]+$/);
export const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const relativePath = z.string().min(1).max(240).regex(/^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9_. -]+(?:\/[A-Za-z0-9_. -]+)*$/);
export const publicUrl = z.string().max(2000).url();
export function safePublicUrl(value: string): boolean {
 try {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return false;
  // Public provenance URLs never need signed queries. Reject query strings entirely.
  if (url.search || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
  return !/(?:token|secret|api[_-]?key|bearer|password|credential)[=/]/i.test(decodeURIComponent(url.pathname));
 } catch { return false; }
}
const color = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|white|black|transparent|currentColor|(?:oklch|oklab|hsl|hsla|rgb|rgba)\([\d.,%+\- /]+\))$/i;
const length = /^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))$/;
export function safeToken(key: string, value: string): boolean {
 if (!value || value.length > 1024 || /[;{}@\\\x00-\x1f\x7f]|\/\*|url\(|expression\(|!important/i.test(value)) return false;
 if ((colorTokens as readonly string[]).includes(key)) return color.test(value);
 if ((fontTokens as readonly string[]).includes(key)) return value.split(',').every(part => /^(?:[a-zA-Z][a-zA-Z0-9 .-]*|"[a-zA-Z][a-zA-Z0-9 .-]*"|'[a-zA-Z][a-zA-Z0-9 .-]*')$/.test(part.trim()));
 if ((shadowTokens as readonly string[]).includes(key)) {
  if (value === 'none') return true;
  // Check each shadow after extracting the only allowed color functions/hex/named colors.
  const reduced = value.replace(/(?:oklch|oklab|hsl|hsla|rgb|rgba)\([\d.,%+\- /]+\)|#[\da-f]{3,8}\b|\b(?:white|black|transparent|currentColor)\b/gi, 'COLOR');
  return reduced.split(',').every(part => {
   const words = part.trim().split(/\s+/);
   const sizes = words.filter(word => length.test(word));
   return sizes.length >= 2 && sizes.length <= 4 && words.filter(word => word === 'COLOR').length === 1 && words.every(word => length.test(word) || word === 'COLOR' || word === 'inset');
  });
 }
 return length.test(value) && (key === 'tracking-normal' || !value.startsWith('-'));
}
const token = z.string().min(1).max(1024);
const tokenShape = Object.fromEntries(tokenKeys.map(key => [key, token])) as Record<typeof tokenKeys[number], typeof token>;
export const themeSchema = z.strictObject({
 schemaVersion: z.literal(1), name: id,
 source: z.strictObject({type: z.enum(['starter','tweakcn','shadcn-registry','custom']), reference: text.nullable()}),
 tokens: z.strictObject({theme: z.strictObject(tokenShape).partial(), light: z.strictObject(tokenShape), dark: z.strictObject(tokenShape)}),
});
export const colorModeSchema = z.strictObject({supported: z.array(z.enum(['light','dark'])).min(1).max(2), default: z.enum(['light','dark','system']), userSelectable: z.boolean()});
export const configSchema = z.strictObject({
 schemaVersion: z.literal(1), project: z.strictObject({name: text, summary: text}),
 documents: z.strictObject({project: relativePath.nullable(), spec: relativePath.nullable(), design: relativePath.nullable()}),
 capabilities: z.strictObject({selected: z.array(id), deferred: z.array(id), excluded: z.array(id)}),
 appearance: z.strictObject({colorMode: colorModeSchema, theme: z.strictObject({source: z.enum(['starter','tweakcn','shadcn-registry','custom']), name: id, reference: text.nullable(), file: relativePath}), fonts: z.enum(['system-fallback','self-hosted','project-provided','approved-external']).optional()}),
 skills: z.strictObject({manifest: relativePath}),
});
export const sourcesSchema = z.strictObject({schemaVersion: z.literal(1), entries: z.array(z.strictObject({
 id, type: z.enum(['repository-file','public-url','external-material','design-document','migration-source']), title: text,
 path: relativePath.optional(), url: publicUrl.optional(), reference: text.optional(),
}))});
export const skillsSchema = z.strictObject({schemaVersion: z.literal(1), entries: z.array(z.strictObject({
 name: id, source: id, classification: z.enum(['compatible','adapt','redundant','project-specific','conflict','unsafe','irrelevant']),
 decision: z.enum(['accepted','adapted','rejected','deferred']), approved: z.boolean(), installedPath: relativePath.nullable(), notes: text,
}))});
export const schemaFiles = {
 'project-config.schema.json': configSchema, 'project-sources.schema.json': sourcesSchema,
 'project-skills.schema.json': skillsSchema, 'theme.schema.json': themeSchema,
};
export type ProjectConfig = z.infer<typeof configSchema>;
export type Theme = z.infer<typeof themeSchema>;
export function validateTheme(input: unknown): Theme {
 const parsed = themeSchema.safeParse(input);
 if (!parsed.success) throw new Error('Invalid normalized theme structure (version, keys, or missing semantic tokens).');
 const theme = parsed.data;
 for (const map of Object.values(theme.tokens)) for (const [key,value] of Object.entries(map)) {
  if (!safeToken(key,value)) throw new Error(`Invalid CSS value for allowlisted token ${key}.`);
 }
 if (theme.source.reference !== null && !safeReference(theme.source.reference)) throw new Error('Invalid theme provenance reference.');
 return theme;
}
export function safeReference(value: string): boolean {
 return value.startsWith('https:') ? safePublicUrl(value) : relativePath.safeParse(value).success;
}
