import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
assert.equal(JSON.parse(await readFile('package.json','utf8')).name,'markdown-code-clean-install','Production fixture refuses non-fixture applications');
process.env.NODE_ENV = 'production';
const runtime = await import(pathToFileURL(resolve('dist/server/server.js')).href);
assert.equal(typeof runtime.default.fetch,'function','Actual TanStack production request handler');
const response = await runtime.default.fetch(new Request('http://fixture.local/markdown-fixture'));
assert.equal(response.status,200);
const html = await response.text();
assert.ok(html.includes('<h1>Generated consumer</h1>'));
assert.ok(html.includes('Copy typescript code'));
assert.ok(html.includes('--markdown-token-light'));
const walk = async (directory) => {
 for (const entry of await readdir(directory,{withFileTypes:true})) {
  const path = join(directory,entry.name);
  if (entry.isDirectory()) {await walk(path);continue;}
  assert.ok(!path.endsWith('.wasm'),'No WASM in production client');
  if (path.endsWith('.js')) assert.doesNotMatch(await readFile(path,'utf8'),/oniguruma|createHighlighterCore|vscode-textmate|markdown-it/,'No parser/highlighter in production client');
 }
};
await walk('dist/client');
console.info('Generated consumer actual Node production handler SSR and production client boundary passed');
