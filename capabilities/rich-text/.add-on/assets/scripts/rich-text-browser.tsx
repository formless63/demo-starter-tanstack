import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {renderToString} from 'react-dom/server';
import {RichTextExample} from '../src/integrations/rich-text/Example';
import {verifyRichText} from './rich-text-browser-checks';
import {richTextFixtureHtml,richTextFixtureContentTypes} from './rich-text-html';
const html=renderToString(<RichTextExample/>);
assert.match(html,/Hello rich text/);assert.doesNotMatch(html,/contenteditable/);
const directory=await mkdtemp(join(tmpdir(),'rich-text-browser-'));
const result=await Bun.build({entrypoints:[join(import.meta.dir,'rich-text-client.tsx')],outdir:directory,target:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
assert.equal(result.success,true,result.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/client.js'?new Response(Bun.file(result.outputs[0].path),{headers:{'content-type':richTextFixtureContentTypes.script}}):new Response(richTextFixtureHtml(html),{headers:{'content-type':richTextFixtureContentTypes.html}});}});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.goto(`http://127.0.0.1:${server.port}`);await verifyRichText(page);assert.deepEqual(errors,[]);console.info('Rich text: real SSR/hydration, safe editing, formatting, links, undo/redo, rejection, replacement and remount passed');}finally{await browser?.close();server.stop(true);await rm(directory,{recursive:true,force:true});}
