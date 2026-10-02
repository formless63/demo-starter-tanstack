import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { renderToString } from 'react-dom/server';
import { parseMarkdown } from '../src/integrations/markdown-code/markdown.server';
import { MarkdownExample } from './markdown-code-example';

const source = '# Safe content\n\n[link](https://example.com)\n\n![alt only](https://tracker.invalid/image.png)\n\n<script>window.pwned=true</script>\n\n```ts\nconst greeting = "<script>"\n```\n\n```unknown\nplaintext\n```';
const document = await parseMarkdown(source);
const html = renderToString(<MarkdownExample document={document}/>);
assert.ok(html.includes('<h1>Safe content</h1>'));
const directory = await mkdtemp(join(tmpdir(),'markdown-code-browser-'));
const scriptDirectory = fileURLToPath(new URL('.',import.meta.url));
await build({configFile:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[react(),{name:'markdown-client-boundary',generateBundle(_options,bundle) {
 for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') {
  for (const id of Object.keys(chunk.modules)) assert.ok(!/node_modules\/(?:shiki|@shikijs|markdown-it|oniguruma)/.test(id),'client bundle excludes parser/highlighter/grammars/WASM');
 }
}}],build:{outDir:directory,emptyOutDir:true,lib:{entry:join(scriptDirectory,'markdown-code-client.tsx'),formats:['es'],fileName:()=>'client.js'}}});
const json = JSON.stringify(document).replace(/</g,'\\u003c');
const css = await readFile(join(scriptDirectory,'../src/integrations/markdown-code/markdown-code.css'),'utf8');
const client = await readFile(join(directory,'client.js'));
const server = createServer((request,response) => {
 if (request.url === '/client.js') {response.writeHead(200,{'content-type':'application/javascript'}).end(client);return;}
 response.writeHead(200,{'content-type':'text/html'}).end(`<!doctype html><html lang="en"><head><title>Markdown fixture</title><style>${css}</style></head><body><div id="root">${html}</div><script id="data" type="application/json">${json}</script><script type="module" src="/client.js"></script></body></html>`);
});
await new Promise<void>((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const port = (server.address() as AddressInfo).port;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
 browser = await chromium.launch({headless:true});
 const context = await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 const page = await context.newPage();
 const errors:string[] = [];
 const external:string[] = [];
 page.on('pageerror',error => errors.push(error.message));
 page.on('console',message => {if(message.type()==='error')errors.push(message.text());});
 page.on('request',request => {if(!request.url().startsWith(`http://127.0.0.1:${port}`))external.push(request.url());});
 await page.goto(`http://127.0.0.1:${port}`);
 await expect(page.getByRole('heading',{name:'Safe content'})).toBeVisible();
 assert.equal(await page.locator('img').count(),0);
 assert.equal(await page.evaluate(() => Object.hasOwn(window,'pwned')),false);
 const copy = page.getByRole('button',{name:'Copy typescript code'});
 await copy.press('Enter');
 await expect(page.getByRole('status').first()).toHaveText('Copied');
 assert.equal(await page.evaluate(() => navigator.clipboard.readText()),'const greeting = "<script>"\n');
 await copy.click();
 await expect(page.getByRole('status').first()).toHaveText('Copied');
 const colored = page.locator('code span[style]').first();
 const light = await colored.evaluate(el => getComputedStyle(el).color);
 await page.getByRole('button',{name:'Toggle theme'}).click();
 assert.notEqual(await colored.evaluate(el => getComputedStyle(el).color),light);
 await page.getByRole('button',{name:'Toggle content'}).click();
 await expect(page.getByRole('region',{name:'Markdown content'})).toHaveCount(0);
 await page.getByRole('button',{name:'Toggle content'}).click();
 await expect(page.getByRole('status').first()).toHaveText('');
 await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:() => Promise.reject(new Error('Denied'))}}));
 await copy.click();
 await expect(page.getByRole('status').first()).toHaveText('Could not copy. Select the code and copy it manually.');
 // Pending clipboard operation cannot update a replacement/unmounted block.
 await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:() => new Promise<void>(resolve => { (window as unknown as {finishCopy:()=>void}).finishCopy = resolve; })}}));
 await copy.click();
 await page.getByRole('button',{name:'Toggle content'}).click();
 await page.evaluate(() => (window as unknown as {finishCopy:()=>void}).finishCopy());
 await page.getByRole('button',{name:'Toggle content'}).click();
 await expect(page.getByRole('status').first()).toHaveText('');
 // Replacement at the same tree position must reset the mounted block's generation.
 await copy.click();
 await expect(copy).toBeDisabled();
 await page.getByRole('button',{name:'Replace code'}).click();
 await expect(page.getByRole('status').first()).toHaveText('');
 await page.evaluate(() => (window as unknown as {finishCopy:()=>void}).finishCopy());
 await expect(page.getByRole('status').first()).toHaveText('');
 await expect(copy).toBeEnabled();
 await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async (text:string) => { (window as unknown as {copied:string}).copied = text; }}}));
 await copy.click();
 await expect(page.getByRole('status').first()).toHaveText('Copied');
 assert.equal(await page.evaluate(() => (window as unknown as {copied:string}).copied),'replacement code\n');
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[]);
 console.info('Markdown actual SSR/hydration, keyboard/repeated clipboard, failure/unmount, theme, hostile content and browser bundle exclusion passed');
} finally { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(()=>resolve())); await rm(directory,{recursive:true,force:true}); }
