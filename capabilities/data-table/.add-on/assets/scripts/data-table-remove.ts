// Disposable clean-consumer fixture only; never an application uninstaller.
import { readFile, writeFile, rm } from "node:fs/promises";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (pkg.name !== "data-table-addon-clean-install") throw new Error("Removal fixture requires its own clean consumer");
for (const path of ["src/components/data-table.tsx", "scripts/data-table-example.tsx", "scripts/data-table-client.tsx", "scripts/data-table-browser.tsx", "capabilities/data-table/CAPABILITY.md", "scripts/data-table-remove.ts"]) await rm(path);
delete pkg.scripts["data-table:browser"];
delete pkg.dependencies["@tanstack/react-table"];
delete pkg.devDependencies["@playwright/test"];
delete pkg.devDependencies["@types/bun"];
await writeFile("package.json", `${JSON.stringify(pkg,null,2)}\n`);
const result = Bun.spawnSync(["bun","install"], {stdout:"inherit",stderr:"inherit"});
if(result.exitCode !== 0) throw new Error("Removal install failed");
