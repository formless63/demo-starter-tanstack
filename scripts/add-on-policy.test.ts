import {expect,it} from 'vitest';
import catalog from '../capabilities/catalog.json';
import {installationCollisions} from './add-on-policy';
const selected=(ids:string[])=>catalog.capabilities.filter(c=>ids.includes(c.id)&&'tanstackAddOn' in c) as Parameters<typeof installationCollisions>[1];
it('detects schema/journal collisions and recognizes the reviewed dependency registry overlay',()=>{
 const collisions=installationCollisions(process.cwd(),selected(['jobs','api-platform','audit-log']));
 expect(collisions.map(c=>c.path)).toContain('drizzle/meta/_journal.json');expect(collisions.map(c=>c.path)).toContain('drizzle.config.ts');
 expect(installationCollisions(process.cwd(),selected(['jobs','webhooks']))).toEqual([]);
});
