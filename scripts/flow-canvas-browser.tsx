import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect, type Locator } from '@playwright/test';
import { renderToString } from 'react-dom/server';
import { FlowExample } from './flow-canvas-example';

const html=renderToString(<FlowExample/>);
assert.ok(html.includes('Graph nodes'));
assert.ok(!html.includes('react-flow__renderer'));
const directory=await mkdtemp(join(tmpdir(),'flow-canvas-browser-'));
const source=fileURLToPath(new URL('.',import.meta.url));
const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
try {await build({configFile:false,publicDir:false,mode:'production',plugins:[react()],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:directory,emptyOutDir:true,lib:{entry:join(source,'flow-canvas-client.tsx'),formats:['es'],fileName:()=>'client.js'}}});} finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
// This isolated fixture serves only its explicit JS/CSS bundle, never app public uploads/assets.
const assets=await readdir(directory,{withFileTypes:true});
assert.ok(assets.some(asset=>asset.name==='client.js'),'Flow fixture emits its client entry');
assert.ok(assets.every(asset=>asset.isFile()&&/\.(js|css)$/.test(asset.name)),'Flow fixture output contains only bundled files, with no copied public subdirectories');
const files=new Map<string,Buffer>();for(const asset of assets)files.set(`/${asset.name}`,await readFile(join(directory,asset.name)));
const css=[...files.keys()].filter(k=>k.endsWith('.css')).map(k=>`<link rel="stylesheet" href="${k}">`).join('');
const server=createServer((req,res)=>{const file=files.get(req.url??'');if(file){res.writeHead(200,{'content-type':req.url?.endsWith('.css')?'text/css':'application/javascript'}).end(file);return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Flow fixture</title>${css}</head><body><div id="root">${html}</div><script type="module" src="/client.js"></script></body></html>`);});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const errors:string[]=[];const outside:string[]=[];const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 page.on('pageerror',e=>{errors.push(e.message);console.error(e);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});page.on('request',r=>{if(!r.url().startsWith(base))outside.push(r.url());});
 async function hitPoint(locator:Locator,label:string,disabledHandle=false) {
  await locator.scrollIntoViewIfNeeded();await expect(locator).toBeVisible();
  const point=await locator.evaluate((element,disabled)=>{
   const rect=element.getBoundingClientRect();const x=rect.x+rect.width/2,y=rect.y+rect.height/2;const hit=document.elementFromPoint(x,y);
   const matches=!!hit&&(disabled?hit.closest('.flow-visual')===element.closest('.flow-visual'):element===hit||element.contains(hit));
   return {x,y,matches,expected:element.outerHTML.slice(0,240),hit:hit?.outerHTML.slice(0,240),active:document.activeElement?.outerHTML.slice(0,200)};
  },disabledHandle);
  assert.ok(point.matches,`${label} must receive the real pointer: ${JSON.stringify(point)}`);return point;
 }
 await page.goto(base);
 const main=page.getByRole('region',{name:'Primary graph',exact:true});const second=page.getByRole('region',{name:'Independent graph',exact:true});
 await expect(main.getByRole('button',{name:'Add node',exact:true})).toBeEnabled();await expect(main.locator('.react-flow__renderer')).toBeVisible();await expect(main.getByRole('button',{name:'Finish 😀 café (finish)',exact:true})).toBeVisible();

 const rendered=main.locator('.react-flow__node').filter({hasText:/^Start$/});
 const currentX=async()=>JSON.parse(await page.getByTestId('graph-json').innerText()).nodes.find((node:{id:string})=>node.id==='start').position.x as number;
 const initialX=await currentX();await rendered.scrollIntoViewIfNeeded();await rendered.focus();await expect(rendered).toBeFocused();
 // Native React Flow keyboard movement requires explicit selection; focus alone only controls viewport visibility.
 await rendered.press('Enter');await expect(rendered).toHaveClass(/selected/);await expect(main.getByRole('button',{name:'Start (start)',exact:true})).toHaveAttribute('aria-pressed','true');
 await rendered.press('ArrowRight');await expect.poll(currentX,{message:'Selected native ArrowRight emits the five-pixel controlled position proposal'}).toBe(initialX+5);
 const beforeDrag=await currentX();const startPoint=await hitPoint(rendered,'Selected native node');
 await page.mouse.move(startPoint.x,startPoint.y);await page.mouse.down();await page.mouse.move(startPoint.x+40,startPoint.y+20,{steps:5});await page.mouse.up();await expect.poll(currentX,{message:'Native pointer drag changes the authoritative graph position'}).not.toBe(beforeDrag);
 // The parent rejects both the document proposal and vendor visual state.
 await page.getByLabel('Reject proposals',{exact:true}).check();
 // React Flow hides nodes until ResizeObserver measures them after a controlled reset.
 // Geometry and authoritative graph bytes are the invariants, not incidental visibility/z-index styles.
 await expect(rendered).toBeVisible();const rejectedGraph=await page.getByTestId('graph-json').innerText();const rejectedX=await currentX();
 const beforeTransform=await rendered.evaluate(element=>getComputedStyle(element).transform);assert.notEqual(beforeTransform,'none');
 await rendered.scrollIntoViewIfNeeded();await rendered.focus();await expect(rendered).toBeFocused();await expect(rendered).toHaveClass(/selected/);await rendered.press('ArrowRight');await expect.poll(currentX,{message:'Parent rejection preserves the authoritative keyboard position'}).toBe(rejectedX);await expect(rendered).toBeVisible();await expect(rendered).toHaveCSS('transform',beforeTransform);await expect(page.getByTestId('graph-json')).toHaveText(rejectedGraph);
 const viewport=main.locator('.react-flow__viewport');const viewportBefore=await viewport.evaluate(element=>getComputedStyle(element).transform);assert.notEqual(viewportBefore,'none');await main.getByRole('button',{name:/zoom in/i}).click();await expect(viewport).toHaveCSS('transform',viewportBefore);await expect(page.getByTestId('graph-json')).toHaveText(rejectedGraph);
 await page.getByLabel('Reject proposals',{exact:true}).uncheck();
 // Escape destroys the old gesture; its later mouseup cannot apply another edit.
 await rendered.scrollIntoViewIfNeeded();await rendered.focus();await expect(rendered).toBeFocused();const escapePoint=await hitPoint(rendered,'Escape gesture node');const beforeEscapeDrag=await currentX();
 await page.mouse.move(escapePoint.x,escapePoint.y);await page.mouse.down();await page.mouse.move(escapePoint.x+25,escapePoint.y+10,{steps:3});await expect.poll(currentX,{message:'Interrupted native drag must first deliver a real position proposal'}).not.toBe(beforeEscapeDrag);await expect(rendered,'Controlled drag must retain native focus before Escape').toBeFocused();await page.keyboard.press('Escape');await expect(main.getByRole('status')).toHaveText('Selection and gesture cleared.');const escaped=await page.getByTestId('graph-json').innerText();await page.mouse.move(escapePoint.x+100,escapePoint.y+60);await page.mouse.up();await expect(page.getByTestId('graph-json')).toHaveText(escaped);
 const hostileLabel='<img src="https://tracker.invalid/x" onerror="alert(1)"> 😀';
 const labelInput=main.getByLabel('Node label',{exact:true});const addButton=main.getByRole('button',{name:'Add node',exact:true});
 await labelInput.fill(hostileLabel);await expect(labelInput).toHaveValue(hostileLabel);await expect(addButton).toBeEnabled();await addButton.focus();await expect(addButton).toBeFocused();
 const activation:unknown[]=[];await page.exposeFunction('recordFlowActivation',(event:unknown)=>activation.push(event));
 await addButton.evaluate(button=>{
  const record=(phase:string)=>(event:Event)=>{if(event.target!==button)return;void (window as unknown as {recordFlowActivation:(value:unknown)=>Promise<void>}).recordFlowActivation({phase,type:event.type,key:event instanceof KeyboardEvent?event.key:undefined,trusted:event.isTrusted,prevented:event.defaultPrevented});};
  for(const type of ['keydown','keyup','click']){window.addEventListener(type,record('window capture'),true);button.addEventListener(type,record('button'));}
 });
 await addButton.press('Enter');
 try {await expect(main.getByRole('list',{name:'Primary graph nodes'}).getByRole('button')).toHaveCount(3);} catch(error) {
  console.error('Flow keyboard Add diagnostics',JSON.stringify({activation,status:await main.getByRole('status').innerText(),graph:await page.getByTestId('graph-json').innerText(),label:await labelInput.inputValue(),x:await main.getByLabel('X position',{exact:true}).inputValue(),y:await main.getByLabel('Y position',{exact:true}).inputValue(),reject:await page.getByLabel('Reject proposals',{exact:true}).isChecked(),disabled:await addButton.isDisabled(),focus:await page.evaluate(()=>document.activeElement?.outerHTML)}));throw error;
 }await expect(second.getByRole('list',{name:'Independent graph nodes'}).getByRole('button')).toHaveCount(2);assert.equal(await page.locator('img').count(),0);
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
 const readOnlyGraph=await page.getByTestId('graph-json').innerText();const readOnlyStatus=await main.getByRole('status').innerText();await main.locator('.flow-visual').scrollIntoViewIfNeeded();const lockedSource=await hitPoint(main.locator('.react-flow__handle.source').first(),'Read-only source node',true);const lockedTarget=await hitPoint(main.locator('.react-flow__handle.target').nth(1),'Read-only target node',true);
 await page.mouse.move(lockedSource.x,lockedSource.y);await page.mouse.down();await page.mouse.move(lockedTarget.x,lockedTarget.y,{steps:5});await expect(main.locator('.react-flow__connection')).toHaveCount(0);await page.mouse.up();await expect(page.getByTestId('graph-json')).toHaveText(readOnlyGraph);await expect(main.getByRole('status')).toHaveText(readOnlyStatus);
 await page.getByLabel('Read only',{exact:true}).uncheck();

 await main.getByRole('button',{name:'Start (start)',exact:true}).click();await main.getByRole('button',{name:'Delete selected node',exact:true}).click();await expect(main.getByRole('button',{name:'Add node',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Save graph',exact:true}).click();await page.getByRole('button',{name:'Toggle editor',exact:true}).click();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await page.getByRole('button',{name:'Toggle editor',exact:true}).click();await expect(page.getByTestId('dirty')).toHaveText('Unsaved changes');
 await page.getByRole('button',{name:'Load hostile IDs',exact:true}).click();await expect(main.locator('.react-flow__node')).toHaveCount(2);
 const wireIds=await main.locator('.react-flow__node').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-id')));assert.ok(wireIds.every(id=>id&&/^graph-[a-f0-9-]+$/.test(id)));
 const hostileNode=main.locator('.react-flow__node').first();await hostileNode.scrollIntoViewIfNeeded();await hostileNode.focus();await expect(hostileNode).toBeFocused();await hostileNode.press('Enter');await expect(hostileNode).toHaveClass(/selected/);const hostileBefore=JSON.parse(await page.getByTestId('graph-json').innerText()).nodes[0].position.x;await hostileNode.press('ArrowRight');await expect.poll(async()=>JSON.parse(await page.getByTestId('graph-json').innerText()).nodes[0].position.x,{message:'Imported hostile-ID node uses real native selected keyboard movement'}).toBe(hostileBefore+5);assert.equal(JSON.parse(await page.getByTestId('graph-json').innerText()).nodes[0].id,'quoted"[id]\\n');
 const sourceHandle=main.locator('.react-flow__node').first().locator('.react-flow__handle.source');const targetHandle=main.locator('.react-flow__node').nth(1).locator('.react-flow__handle.target');await main.locator('.flow-visual').scrollIntoViewIfNeeded();const sourcePoint=await hitPoint(sourceHandle,'Hostile-ID source handle');const targetPoint=await hitPoint(targetHandle,'Hostile-ID target handle');await page.mouse.move(sourcePoint.x,sourcePoint.y);await page.mouse.down();await page.mouse.move(targetPoint.x,targetPoint.y,{steps:8});await page.mouse.up();await expect.poll(async()=>JSON.parse(await page.getByTestId('graph-json').innerText()).edges.length).toBe(1);assert.equal(JSON.parse(await page.getByTestId('graph-json').innerText()).edges[0].source,'quoted"[id]\\n');
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);console.info('Actual Flow SSR/hydration, semantic edits, controlled rejection, isolation, hostile text and persistence races passed');
} finally {await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
