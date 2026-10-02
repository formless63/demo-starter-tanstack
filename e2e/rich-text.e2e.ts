import {test,expect} from '@playwright/test';
import {verifyRichText} from '../capabilities/rich-text/.add-on/assets/scripts/rich-text-browser-checks';
test('rich text reference SSR hydration and controlled editor lifecycle',async({page,request})=>{const response=await request.get('/rich-text-test');expect(await response.text()).toContain('Hello rich text');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/rich-text-test');await verifyRichText(page);expect(errors).toEqual([]);});
