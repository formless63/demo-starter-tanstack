import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
test('Medusa protocol fixed-clock fixture has root/authored/compiled parity',()=>{
 const path='scripts/medusa-protocol-fixture.ts';const source=readFileSync(path,'utf8');
 assert.equal(readFileSync(`capabilities/medusa/.add-on/assets/${path}`,'utf8'),source);
 assert.equal(JSON.parse(readFileSync('capabilities/medusa/add-on.json','utf8')).files[path],source);
 const boundary=source.slice(source.indexOf('const timestamp='),source.indexOf('let requests='));
 assert.ok(boundary.includes('[-300,300]'));assert.ok(boundary.includes('[-301,301]'));assert.ok(boundary.includes('now:timestamp+1'));assert.ok(!boundary.includes('Date.now'));
});
