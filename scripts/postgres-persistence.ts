import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const project=`persistence-${randomUUID()}`;
function compose(...args:string[]) {
 const result=spawnSync('docker',['compose','-p',project,'-f','compose.yaml',...args],{env:{...process.env,POSTGRES_PORT:'0',POSTGRES_DB:'starter',POSTGRES_USER:'starter',POSTGRES_PASSWORD:'persistence-only-fixture'},encoding:'utf8'});
 assert.equal(result.status,0,'Disposable PostgreSQL persistence command failed'); return result.stdout.trim();
}
try {
 compose('up','-d','--wait','postgres');
 const sql=(query:string)=>compose('exec','-T','postgres','psql','-U','starter','-d','starter','-Atc',query);
 assert.equal(sql('SHOW data_directory'),'/var/lib/postgresql/18/docker');
 sql('CREATE TABLE persistence_marker(value text); INSERT INTO persistence_marker VALUES (\'retained\')');
 compose('down'); // deliberately retain named volume but remove container/anonymous identity
 compose('up','-d','--wait','postgres');
 assert.equal(sql('SELECT value FROM persistence_marker'),'retained');
 console.info('PostgreSQL 18 named-volume persistence survived container recreation');
} finally {compose('down','--volumes','--remove-orphans')}
