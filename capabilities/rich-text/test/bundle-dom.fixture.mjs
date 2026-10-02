// @vitest-environment node
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM,VirtualConsole} from 'jsdom';
import {expect,test} from 'vitest';
import {richTextFixtureContentTypes} from '../.add-on/assets/scripts/rich-text-html';

test('actual Bun SSR bytes and minified client hydrate with explicit UTF-8; missing charset reproduces React #418',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'rich-text-encoding-'));
 try{
  const result=spawnSync('bun',['scripts/rich-text-compile-fixture.mjs',directory],{encoding:'utf8',env:{...process.env,NODE_ENV:'test'}});
  expect(result.status,result.stderr).toBe(0);
  const html=await readFile(join(directory,'index.html'));
  const client=await readFile(join(directory,'rich-text-client.js'),'utf8');
  for(const mode of ['header','meta','broken']){
   const bytes=mode==='broken'?Buffer.from(html.toString('utf8').replace('<meta charset="utf-8">','')):html;
   const errors=[];
   const console=new VirtualConsole();
   console.on('error',error=>errors.push(String(error?.message??error)));
   console.on('jsdomError',error=>errors.push(error.message));
   const dom=new JSDOM(bytes,{url:'http://fixture.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console,...(mode==='header'?{contentType:richTextFixtureContentTypes.html}:{})});
   try{
    Object.assign(dom.window,{TextEncoder});
    const before=dom.window.document.querySelector('output')?.textContent;
    expect(before).toBe(mode==='broken'?'Loading editorâ€¦':'Loading editor…');
    expect(dom.window.document.characterSet).toBe(mode==='broken'?'windows-1252':'UTF-8');
    // Evaluate only our locally compiled, trusted browser fixture, without networking.
    dom.window.eval(client);
    await expect.poll(()=>Boolean(dom.window.document.querySelector('[contenteditable]')), {timeout:5000}).toBe(true);
    expect(dom.window.document.querySelector('[contenteditable]')?.textContent).toBe('Hello rich text');
    if(mode==='broken')expect(errors.some(error=>error.includes('#418'))).toBe(true);
    else expect(errors).toEqual([]);
   }finally{dom.window.close();}
  }
 }finally{await rm(directory,{recursive:true,force:true});}
},15000);
