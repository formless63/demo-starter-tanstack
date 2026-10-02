import assert from 'node:assert/strict';
import { existsSync,readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkdown, MarkdownLimitError, markdownLimits } from '../src/integrations/markdown-code/markdown.server';
import { MarkdownContent } from '../src/integrations/markdown-code/MarkdownContent';
import { normalizeMarkdownDocument, safeMarkdownHref } from '../src/integrations/markdown-code/types';
import type { MarkdownDocument, MarkdownNode } from '../src/integrations/markdown-code/types';

const render = async (source:string) => renderToStaticMarkup(<MarkdownContent document={await parseMarkdown(source)} />);
const output = await render('# Title\n\n**bold** and *emphasis* and ~~deleted~~ and `inline`\n\n> quote\n\n3. Third\n4. Fourth\n\n|Name|Value|\n|---|---|\n|Ada|42|\n');
for (const marker of ['<h1>Title</h1>','<strong>bold</strong>','<em>emphasis</em>','<s>deleted</s>','<code>inline</code>','<blockquote>','<ol start="3">','<th>Name</th>']) assert.ok(output.includes(marker),marker);
for (const href of ['javascript:alert(1)','data:text/html,x','vbscript:x','//example.com','/\\example.com','https://user:password@example.com','http://example.com','./local','../local','mailto:a@example.com?subject=x','https://example.com\u0000','https:example.com','mailto:a%0ab@example.com']) assert.equal(safeMarkdownHref(href),undefined,href);
for (const href of ['https://example.com/path','/local','/x?q=yes','#section','mailto:a@example.com']) assert.ok(safeMarkdownHref(href),href);
assert.ok((await render('0. First\n1. Second')).includes('<ol start="0">'));
assert.ok((await render('1. First\n2. Second')).includes('<ol start="1">'));
const sparseTable = '|'+Array(50).fill('x').join('|')+'|\n|'+Array(50).fill('-').join('|')+'|\n'+('|x|\n').repeat(30);
await assert.rejects(() => parseMarkdown(sparseTable), (error:unknown) => error instanceof MarkdownLimitError && error.allocatedTokens === markdownLimits.tokens);
const hostile = await render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [encoded](jav&#x61;script:alert(1)) [protocol](//evil.test)\n\n![safe alt](https://tracker.invalid/a.png)\n\n[ok](https://example.com)');
assert.ok(hostile.includes('&lt;script&gt;'));
assert.ok(hostile.includes('safe alt'));
assert.ok(hostile.includes('href="https://example.com/"'));
for (const marker of ['<script','<img','href="javascript','href="//','onerror="']) assert.ok(!hostile.includes(marker),marker);
const firstCode = (nodes:MarkdownNode[]) => nodes.find(node => node.kind === 'code');
const document = await parseMarkdown('```ts ignored metadata\nconst greeting = "<script>"\n```\n');
const code = firstCode(document.nodes);
assert.equal(code?.kind,'code');
if (code?.kind !== 'code') throw new Error('Missing code');
assert.equal(code.text,'const greeting = "<script>"\n');
assert.ok(code.lines?.some(line => line.some(token => token.light && token.dark)),'actual Shiki highlighting');
assert.equal(code.lines?.map(line => line.map(token => token.text).join('')).join('\n'),code.text,'exact original code including trailing newline');
const html = renderToStaticMarkup(<MarkdownContent document={document}/>);
assert.match(html,/Copy typescript code/);
assert.match(html,/&lt;script&gt;/);
assert.match(html,/<output aria-live="polite"/);
assert.match(html,/tabindex="0"/);
assert.match(html,/disabled=""/,"SSR copy stays disabled until hydration is ready");
const unknown = firstCode((await parseMarkdown('```not-a-language\n<script>plain</script>\n```')).nodes);
assert.ok(unknown?.kind === 'code' && unknown.language === 'text' && unknown.lines === undefined);
const windowsCode = firstCode((await parseMarkdown('```ts\r\nconst value = 1\r\n```')).nodes);
assert.ok(windowsCode?.kind === 'code' && windowsCode.text === 'const value = 1\n');
const longLine = firstCode((await parseMarkdown(`\`\`\`ts\n${'x'.repeat(markdownLimits.highlightLineCharacters+1)}\n\`\`\``)).nodes);
assert.ok(longLine?.kind === 'code' && longLine.lines === undefined);
await assert.rejects(() => parseMarkdown('x'.repeat(markdownLimits.inputBytes+1)),MarkdownLimitError);
await assert.rejects(() => parseMarkdown('😀'.repeat(markdownLimits.inputBytes/3)),MarkdownLimitError);
await assert.rejects(() => parseMarkdown('a\n\n'.repeat(2049)),MarkdownLimitError);
await assert.rejects(() => parseMarkdown('`x` '.repeat(2000)),MarkdownLimitError);
await assert.rejects(() => parseMarkdown('```\nx\n```\n\n'.repeat(33)),MarkdownLimitError);
await assert.rejects(() => parseMarkdown(`\`\`\`\n${'x'.repeat(markdownLimits.codeCharacters+1)}\n\`\`\``),MarkdownLimitError);
assert.ok(JSON.stringify(await parseMarkdown('> '.repeat(100)+'nested')).length < 65536);
assert.equal(await render(''),'<section class="markdown-content" aria-label="Markdown content"></section>');
console.info('Markdown shipped parser/React renderer: syntax, exact Shiki token roundtrip, SSR escaping, URL policy, alt-only images, plaintext fallback and all resource limits passed');

// A forged/deserialized model still cannot choose an arbitrary element, URL or CSS value.
const forged = {version:1,nodes:[
 {kind:'element',tag:'script',children:[{kind:'text',text:'alert(1)'}]},
 {kind:'element',tag:'img',src:'https://tracker.invalid',onError:'alert(1)',children:[]},
 {kind:'element',tag:'a',href:'javascript:alert(1)',onClick:'alert(1)',style:{backgroundImage:'url(https://tracker.invalid)'},children:[{kind:'text',text:'unsafe target'}]},
 {kind:'code',language:'text',text:'literal',lines:[[{text:'<script>literal</script>',light:'url(https://tracker.invalid)',dark:'#fff;background:red'}]]},
]} as unknown as MarkdownDocument;
const forgedHtml = renderToStaticMarkup(<MarkdownContent document={forged}/>);
assert.ok(forgedHtml.includes('<code>literal</code>'));
for (const marker of ['<script','<img','javascript:','tracker.invalid','background:red','onclick=','onerror=']) assert.ok(!forgedHtml.includes(marker),marker);
console.info('Markdown renderer independently rejects forged tags, hrefs, attributes and highlighted CSS values');

const codeBlocks = async (source:string) => (await parseMarkdown(source)).nodes.filter((node):node is Extract<MarkdownNode,{kind:'code'}> => node.kind === 'code');
const fence = (text:string) => '```ts\n'+text+'```\n\n';
assert.equal((await codeBlocks(fence(('x'.repeat(127)+'\n').repeat(65))))[0].lines,undefined,'per-block highlight budget');
assert.equal((await codeBlocks(fence('x\n'.repeat(128))))[0].lines,undefined,'highlight line budget');
const comments = ('//'+ 'x'.repeat(117)+'\n').repeat(50);
const aggregate = await codeBlocks(fence(comments).repeat(3));
assert.ok(aggregate[0].lines && aggregate[1].lines && !aggregate[2].lines,'aggregate highlight budget');
const operators = ('x+'.repeat(255)+'x\n').repeat(12);
const manyTokens = await codeBlocks(fence(operators).repeat(2));
assert.ok(manyTokens[0].lines && !manyTokens[1].lines,'aggregate span budget');
const maxDepth = (nodes:MarkdownNode[],depth=0):number => Math.max(depth,...nodes.map(node=>node.kind === 'element' ? maxDepth(node.children,depth+1) : depth));
assert.ok(maxDepth((await parseMarkdown('> '.repeat(100)+'nested')).nodes) <= markdownLimits.depth,'bounded rendered nesting');
console.info('Markdown per-block/aggregate highlight characters, line length/count, span and nesting budgets passed');

for (const value of [null, undefined, 1, [], {}, { version: 1, nodes: null }, { version: 1, nodes: [null, { kind: 'code', text: null }] }]) {
 const html = renderToStaticMarkup(<MarkdownContent document={value} />);
 assert.ok(html.length < 200, 'Malformed documents render safely');
}
for (const lines of [null, {}, [null], [[null]], [[{ text: {} }]], [[{ text: 'x'.repeat(65537) }]], Array(129).fill([]), [Array(8193).fill({ text: '' })], [[{ text: 'shown', light: '#ff0000' }]]]) {
 const document = { version: 1, nodes: [{ kind: 'code', text: 'copied', language: 'javascript', lines }] };
 const html = renderToStaticMarkup(<MarkdownContent document={document} />);
 assert.ok(html.includes('<code>copied</code>'), 'Malformed, oversized or mismatched highlights use exact plaintext');
 assert.ok(html.length < 1000);
}
for (const text of [null, {}, 'x'.repeat(32769)]) {
 const html = renderToStaticMarkup(<MarkdownContent document={{ version: 1, nodes: [{ kind: 'code', text, language: {} }] }} />);
 assert.ok(!html.includes('<figure'), 'Malformed or over-budget code is rejected');
}
const flat = normalizeMarkdownDocument({ version: 1, nodes: Array(4097).fill({ kind: 'text', text: 'x' }) });
assert.equal(flat.nodes.length, 4096);
assert.equal(normalizeMarkdownDocument({ version: 1, nodes: [{ kind: 'text', text: '😀'.repeat(20000) }] }).nodes.length, 0);
assert.equal(normalizeMarkdownDocument({ version: 1, nodes: Array(33).fill({ kind: 'code', language: 'text', text: 'x' }) }).nodes.length, 32);
assert.equal(normalizeMarkdownDocument({ version: 1, nodes: Array(5).fill({ kind: 'code', language: 'text', text: 'x'.repeat(8192) }) }).nodes.length, 4);
let deep:unknown = {kind:'text',text:'leaf'};
for(let i=0;i<100;i++) deep={kind:'element',tag:'blockquote',children:[deep]};
assert.equal(maxDepth(normalizeMarkdownDocument({version:1,nodes:[deep]}).nodes),24);
const cycle:Record<string,unknown>={kind:'element',tag:'blockquote'};cycle.children=[cycle];
assert.equal(maxDepth(normalizeMarkdownDocument({version:1,nodes:[cycle]}).nodes),24);
const cssModel = normalizeMarkdownDocument({version:1,nodes:[{kind:'code',language:'javascript',text:'safe',lines:[[{text:'safe',light:'url(https://tracker.invalid)',dark:'#fff;background:red'}]]}]});
assert.ok(cssModel.nodes[0].kind === 'code' && cssModel.nodes[0].lines, 'Valid matching highlight text remains structured');
const cssHtml=renderToStaticMarkup(<MarkdownContent document={cssModel}/>);
for(const marker of ['tracker.invalid','background:red','url(']) assert.ok(!cssHtml.includes(marker));
console.info('Renderer model normalization: malformed/null shapes, bounded text/code/nodes/depth/highlights and exact display/copy equality passed');

const root = fileURLToPath(new URL('../',import.meta.url));
const authored = join(root,'capabilities/markdown-code/.add-on/assets');
if (existsSync(authored)) {
 for (const path of ['src/integrations/markdown-code/types.ts','src/integrations/markdown-code/markdown.server.ts','src/integrations/markdown-code/MarkdownContent.tsx','src/integrations/markdown-code/markdown-code.css','scripts/markdown-code-unit.tsx','scripts/markdown-code-browser.tsx','scripts/markdown-code-example.tsx','scripts/markdown-code-client.tsx','scripts/markdown-code-remove.ts','scripts/markdown-code-fixture-route.ts','scripts/markdown-code-production.mjs','capabilities/markdown-code/CAPABILITY.md']) assert.equal(readFileSync(join(root,path),'utf8'),readFileSync(join(authored,path),'utf8'),`Authored/installed parity: ${path}`);
 console.info('Markdown authored/installed source parity passed');
}
