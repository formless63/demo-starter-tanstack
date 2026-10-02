import {expect,test} from '@playwright/test';
test('Flow reference hydration, isolation and stale persistence',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/flow-test');const graph=page.getByRole('region',{name:'Primary graph',exact:true});
 await expect(graph.getByRole('button',{name:'Add node',exact:true})).toBeEnabled();await expect(graph.locator('.react-flow__renderer')).toBeVisible();
 await graph.getByLabel('Node label',{exact:true}).fill('Reference node');await graph.getByRole('button',{name:'Add node',exact:true}).press('Enter');await expect(graph.getByRole('button',{name:'Reference node (node-1)',exact:true})).toBeVisible();
 await page.getByLabel('Defer persistence',{exact:true}).check();await page.getByRole('button',{name:'Save graph',exact:true}).click();await expect(page.getByRole('button',{name:'Save graph',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Switch record',exact:true}).click();await expect(graph.getByRole('button',{name:'Other record (other)',exact:true})).toBeVisible();await page.getByRole('button',{name:'Resolve request',exact:true}).click();await expect(page.getByRole('status',{name:'Persistence status'})).toHaveText('Loading');await page.getByRole('button',{name:'Resolve request',exact:true}).click();await expect(page.getByRole('status',{name:'Persistence status'})).toHaveText('Loaded');
 await page.getByLabel('Read only',{exact:true}).check();await expect(graph.getByRole('button',{name:'Add node',exact:true})).toBeDisabled();expect(errors).toEqual([]);
});
