import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import { renderToString } from 'react-dom/server';
import { FlowExample } from './flow-canvas-example';

const html=renderToString(<FlowExample/>);
assert.ok(html.includes('Graph nodes'));
assert.ok(!html.includes('react-flow__renderer'));
const directory=await mkdtemp(join(tmpdir(),'flow-canvas-browser-'));
const source=fileURLToPath(new URL('.',import.meta.url));
const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
try {await build({configFile:false,mode:'production',plugins:[react()],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:directory,emptyOutDir:true,lib:{entry:join(source,'flow-canvas-client.tsx'),formats:['es'],fileName:()=>'client.js'}}});} finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
const files=new Map<string,Buffer>();for(const file of await readdir(directory))files.set(`/${file}`,await readFile(join(directory,file)));
const css=[...files.keys()].filter(k=>k.endsWith('.css')).map(k=>`<link rel="stylesheet" href="${k}">`).join('');
const server=createServer((req,res)=>{const file=files.get(req.url??'');if(file){res.writeHead(200,{'content-type':req.url?.endsWith('.css')?'text/css':'application/javascript'}).end(file);return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Flow fixture</title>${css}</head><body><div id="root">${html}</div><script type="module" src="/client.js"></script></body></html>`);});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const errors:string[]=[];const outside:string[]=[];const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 page.on('pageerror',e=>{errors.push(e.message);console.error(e);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});page.on('request',r=>{if(!r.url().startsWith(base))outside.push(r.url());});
 await page.goto(base);
 const main=page.getByRole('region',{name:'Primary graph',exact:true});const second=page.getByRole('region',{name:'Independent graph',exact:true});
 await expect(main.getByRole('button',{name:'Add node',exact:true})).toBeEnabled();await expect(main.locator('.react-flow__renderer')).toBeVisible();await expect(main.getByRole('button',{name:'Finish 😀 café (finish)',exact:true})).toBeVisible();

 const rendered=main.locator('.react-flow__node').filter({hasText:/^Start$/});
 const currentX=async()=>JSON.parse(await page.getByTestId('graph-json').innerText()).nodes.find((node:{id:string})=>node.id==='start').position.x as number;
 const initialX=await currentX();await rendered.focus();await rendered.press('ArrowRight');await expect.poll(currentX).not.toBe(initialX);
 const beforeDrag=await currentX();const bounds=await rendered.boundingBox();assert.ok(bounds);
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+40,bounds.y+bounds.height/2+20,{steps:5});await page.mouse.up();await expect.poll(currentX).not.toBe(beforeDrag);
 // The parent rejects both the document proposal and vendor visual state.
 await page.getByLabel('Reject proposals',{exact:true}).check();const rejectedX=await currentX();const beforeTransform=await rendered.getAttribute('style');
 await rendered.focus();await rendered.press('ArrowRight');await expect.poll(currentX).toBe(rejectedX);await expect(rendered).toHaveAttribute('style',beforeTransform!);
 const viewport=main.locator('.react-flow__viewport');const viewportBefore=await viewport.getAttribute('style');await main.getByRole('button',{name:/zoom in/i}).click();await expect(viewport).toHaveAttribute('style',viewportBefore!);
 await page.getByLabel('Reject proposals',{exact:true}).uncheck();
 // Escape destroys the old gesture; its later mouseup cannot apply another edit.
 const escapeBounds=await rendered.boundingBox();assert.ok(escapeBounds);await rendered.focus();await page.mouse.move(escapeBounds.x+20,escapeBounds.y+20);await page.mouse.down();await page.mouse.move(escapeBounds.x+45,escapeBounds.y+30,{steps:3});await page.keyboard.press('Escape');const escaped=await page.getByTestId('graph-json').innerText();await page.mouse.move(escapeBounds.x+120,escapeBounds.y+80);await page.mouse.up();await expect(page.getByTestId('graph-json')).toHaveText(escaped);
 await main.getByLabel('Node label',{exact:true}).fill('<img src="https://tracker.invalid/x" onerror="alert(1)"> 😀');await main.getByRole('button',{name:'Add node',exact:true}).press('Enter');
 await expect(main.getByRole('list',{name:'Primary graph nodes'}).getByRole('button')).toHaveCount(3);await expect(second.getByRole('list',{name:'Independent graph nodes'}).getByRole('button')).toHaveCount(2);assert.equal(await page.locator('img').count(),0);
 await main.getByLabel('Connection source',{exact:true}).selectOption('start');await main.getByLabel('Connection target',{exact:true}).selectOption('finish');await main.getByRole('button',{name:'Connect nodes',exact:true}).click();await expect(main.getByRole('list',{name:'Primary graph connections'}).getByRole('listitem')).toHaveCount(1);
 await main.getByRole('button',{name:'Connect nodes',exact:true}).click();await expect(main.getByRole('status')).toContainText('rejected');
 await main.getByRole('button',{name:'Start (start)',exact:true}).click();await expect(main.getByRole('button',{name:'Delete selected node',exact:true})).toBeEnabled();
 const nativeEdge=main.locator('.react-flow__edge').first();await nativeEdge.focus();await nativeEdge.press('Enter');await expect(main.getByRole('button',{name:'Delete selected node',exact:true})).toBeDisabled();await expect(main.getByRole('button',{name:'Start (start)',exact:true})).toHaveAttribute('aria-pressed','false');

 await main.getByRole('button',{name:'Start (start)',exact:true}).click();await main.getByLabel('X position',{exact:true}).fill('123');await main.getByRole('button',{name:'Position selected node',exact:true}).click();await expect(page.getByTestId('graph-json')).toContainText('"x":123');
 await page.getByLabel('Reject proposals',{exact:true}).check();await main.getByLabel('Node label',{exact:true}).fill('Rejected edit');await main.getByRole('button',{name:'Rename selected node',exact:true}).click();await expect(main.getByRole('button',{name:'Start (start)',exact:true})).toBeVisible();await page.getByLabel('Reject proposals',{exact:true}).uncheck();
 await page.getByLabel('Defer persistence',{exact:true}).check();await page.getByRole('button',{name:'Save graph',exact:true}).click();await expect(page.getByRole('button',{name:'Save graph',exact:true})).toBeDisabled();
 await main.getByLabel('Node label',{exact:true}).fill('Newer edit');await main.getByRole('button',{name:'Rename selected node',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await expect(page.getByRole('status',{name:'Persistence status'})).toContainText('newer edits remain');await expect(page.getByTestId('dirty')).toHaveText('Unsaved changes');
 await page.getByRole('button',{name:'Save graph',exact:true}).click();await page.getByRole('button',{name:'Reject request',exact:true}).click();await expect(page.getByRole('status',{name:'Persistence status'})).toContainText('Save failed');
 await page.getByRole('button',{name:'Save graph',exact:true}).click();await page.getByRole('button',{name:'Cancel request',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await expect(page.getByRole('status',{name:'Persistence status'})).toContainText('Cancelled');
 await page.getByRole('button',{name:'Switch record',exact:true}).click();await page.getByRole('button',{name:'Switch record',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await expect(main.getByRole('button',{name:'Start (start)',exact:true})).toBeVisible();await page.getByRole('button',{name:'Resolve request',exact:true}).click();
 await page.getByRole('button',{name:'Switch record',exact:true}).click();await main.getByLabel('Node label',{exact:true}).fill('Edit during load');await main.getByRole('button',{name:'Add node',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await expect(main.getByRole('button',{name:'Edit during load (node-1)',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Switch record',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();

 await page.getByLabel('Read only',{exact:true}).check();await expect(main.getByRole('button',{name:'Add node',exact:true})).toBeDisabled();
 await expect(main.locator('.react-flow__handle.connectablestart')).toHaveCount(0);await expect(main.locator('.react-flow__handle.connectableend')).toHaveCount(0);
 const readOnlyGraph=await page.getByTestId('graph-json').innerText();const readOnlyStatus=await main.getByRole('status').innerText();const lockedSource=await main.locator('.react-flow__handle.source').first().boundingBox();const lockedTarget=await main.locator('.react-flow__handle.target').nth(1).boundingBox();assert.ok(lockedSource&&lockedTarget);
 await page.mouse.move(lockedSource.x+lockedSource.width/2,lockedSource.y+lockedSource.height/2);await page.mouse.down();await page.mouse.move(lockedTarget.x+lockedTarget.width/2,lockedTarget.y+lockedTarget.height/2,{steps:5});await expect(main.locator('.react-flow__connection')).toHaveCount(0);await page.mouse.up();await expect(page.getByTestId('graph-json')).toHaveText(readOnlyGraph);await expect(main.getByRole('status')).toHaveText(readOnlyStatus);
 await page.getByLabel('Read only',{exact:true}).uncheck();

 await main.getByRole('button',{name:'Start (start)',exact:true}).click();await main.getByRole('button',{name:'Delete selected node',exact:true}).click();await expect(main.getByRole('button',{name:'Add node',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Save graph',exact:true}).click();await page.getByRole('button',{name:'Toggle editor',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await page.getByRole('button',{name:'Toggle editor',exact:true}).click();await expect(page.getByTestId('dirty')).toHaveText('Unsaved changes');
 await page.getByRole('button',{name:'Load hostile IDs',exact:true}).click();await expect(main.locator('.react-flow__node')).toHaveCount(2);
 const wireIds=await main.locator('.react-flow__node').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-id')));assert.ok(wireIds.every(id=>id&&/^graph-[a-f0-9-]+$/.test(id)));
 const hostileNode=main.locator('.react-flow__node').first();await hostileNode.focus();await hostileNode.press('ArrowRight');assert.equal(JSON.parse(await page.getByTestId('graph-json').innerText()).nodes[0].id,'quoted"[id]\\n');
 const sourceHandle=main.locator('.react-flow__node').first().locator('.react-flow__handle.source');const targetHandle=main.locator('.react-flow__node').nth(1).locator('.react-flow__handle.target');await expect(sourceHandle).toBeVisible();await expect(targetHandle).toBeVisible();const sourceBox=await sourceHandle.boundingBox();const targetBox=await targetHandle.boundingBox();assert.ok(sourceBox&&targetBox);await page.mouse.move(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);await page.mouse.down();await page.mouse.move(targetBox.x+targetBox.width/2,targetBox.y+targetBox.height/2,{steps:8});await page.mouse.up();await expect.poll(async()=>JSON.parse(await page.getByTestId('graph-json').innerText()).edges.length).toBe(1);assert.equal(JSON.parse(await page.getByTestId('graph-json').innerText()).edges[0].source,'quoted"[id]\\n');
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);console.info('Actual Flow SSR/hydration, semantic edits, controlled rejection, isolation, hostile text and persistence races passed');
} finally {await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
