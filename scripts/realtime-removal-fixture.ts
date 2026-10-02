import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const cta = JSON.parse(await readFile(".cta.json","utf8")); assert.equal(cta.projectName,"realtime-addon-clean-install"); assert.ok(resolve(process.cwd()).includes("realtime-addon-"));
// Unit/transport fixtures have already closed every client before runtime removal.
await rm("src/integrations/realtime",{ recursive:true }); await rm("src/lib/realtime.server.ts"); await rm("server/routes/api/realtime",{ recursive:true }); await rm("nitro.config.ts");
// Keep provider-neutral Nitro runtime after removal; websocket features/routes are gone.
const pkg = JSON.parse(await readFile("package.json","utf8")); for (const key of Object.keys(pkg.scripts)) if (key.startsWith("realtime:")) delete pkg.scripts[key]; delete pkg.devDependencies.crossws;
await writeFile("package.json",JSON.stringify(pkg,null,2)+"\n");
for (const file of ["realtime-unit.ts","realtime-transport-fixture.ts"]) await rm(`scripts/${file}`);
assert.equal(spawnSync(process.execPath,["install"],{stdio:"inherit"}).status,0);
console.info("Realtime routes/runtime removed after client cleanup without deleting external data");
