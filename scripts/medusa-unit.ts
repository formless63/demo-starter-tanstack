import './medusa-protocol-fixture';

import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Root-only applied-history evidence; independent consumers have their own migration topology.
if(existsSync('fixtures/medusa-main-migrations.json')){
 const baseline=JSON.parse(await readFile('fixtures/medusa-main-migrations.json','utf8'));const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 for(const [idx,m] of baseline.migrations.entries()){assert.deepEqual(journal.entries[idx],m.entry);assert.equal(createHash('sha256').update(await readFile(`drizzle/${m.entry.tag}.sql`)).digest('hex'),m.sha256);}
 assert.ok(journal.entries.length>=baseline.migrations.length+2);for(const tag of ['0013_medusa_v1','0014_medusa_receipt_conflicts'])assert.equal(journal.entries.filter((e:{tag:string})=>e.tag===tag).length,1);for(let idx=baseline.migrations.length;idx<journal.entries.length;idx++){assert.equal(journal.entries[idx].idx,idx);assert.ok(journal.entries[idx].when>journal.entries[idx-1].when);}
}
