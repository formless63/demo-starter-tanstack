import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { renderToString } from "react-dom/server";
import { Example } from "./data-table-example";

const html = renderToString(<Example />);
assert.match(html, /<table aria-label="People"/);
assert.match(html, /scope="colgroup"/);
assert.match(html, /Ada/);
const directory = await mkdtemp(join(tmpdir(), "data-table-browser-"));
const result = await Bun.build({ entrypoints: [join(import.meta.dir,"data-table-client.tsx")], outdir:directory, target:"browser", minify:true, define:{"process.env.NODE_ENV":'"production"'} });
assert.equal(result.success,true,result.logs.join("\n"));
const server = Bun.serve({hostname:"127.0.0.1",port:0,fetch(request) {
 return new URL(request.url).pathname === "/client.js" ? new Response(Bun.file(result.outputs[0].path),{headers:{"content-type":"application/javascript"}})
 : new Response(`<!doctype html><html lang="en"><head><title>Data Table fixture</title></head><body><div id="root">${html}</div><script type="module" src="/client.js"></script></body></html>`,{headers:{"content-type":"text/html"}});
}});
if (process.env.DATA_TABLE_SERVE_ONLY === "1") {
 console.info(`Data Table browser fixture: http://127.0.0.1:${server.port}`);
 await new Promise(() => {});
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
 browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
 const page = await browser.newPage();
 const errors:string[] = [];
 page.on("pageerror", error => errors.push(error.message));
 page.on("console", message => {if(message.type() === "error")errors.push(message.text());});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const table = page.getByRole("table",{name:"People",exact:true});
 const names = () => table.locator("tbody tr").allTextContents();
 assert.deepEqual(await names(),["Ada30","Bea10"]);
 assert.equal(await table.getByRole("button",{name:"Select",exact:true}).count(),0);
 await table.getByRole("button",{name:"Name",exact:true}).press("Enter");
 assert.equal(await table.getByRole("columnheader",{name:"Name",exact:true}).getAttribute("aria-sort"),"ascending");
 await table.getByRole("button",{name:"Name",exact:true}).click();
 assert.deepEqual(await names(),["Cy20","Bea10"]);
 await table.getByRole("checkbox",{name:"Select Cy"}).check();
 assert.equal(await page.getByLabel("Selection",{exact:true}).textContent(),"cy");
 await page.getByRole("button",{name:"Next",exact:true}).click();
 assert.deepEqual(await names(),["Ada30"]);
 await page.getByRole("button",{name:"Previous",exact:true}).click();
 assert.equal(await table.getByRole("checkbox",{name:"Select Cy"}).isChecked(),true);
 await page.getByLabel("Filter",{exact:true}).fill("Bea");
 assert.deepEqual(await names(),["Bea10"]);
 await page.getByLabel("Filter",{exact:true}).fill("missing");
 assert.deepEqual(await names(),["No results."]);
 await page.getByLabel("Filter",{exact:true}).fill("");
 await page.getByRole("button",{name:"Toggle score"}).click();
 assert.equal(await table.getByRole("columnheader",{name:"Score",exact:true}).count(),0);
 await page.getByRole("button",{name:"Toggle score"}).click();
 await page.getByRole("button",{name:"Toggle table"}).click();
 assert.equal(await table.count(),0);
 await page.getByRole("button",{name:"Toggle table"}).click();
 assert.equal(await table.getByRole("checkbox",{name:"Select Cy"}).isChecked(),true);
 await page.getByRole("button",{name:"Toggle manual"}).click();
 await page.getByLabel("Filter",{exact:true}).fill("missing");
 assert.deepEqual(await names(),["Ada30","Bea10","Cy20"]);
 await page.getByRole("button",{name:"Next",exact:true}).click();
 assert.equal(await page.getByLabel("Page",{exact:true}).textContent(),"2");
 assert.deepEqual(await names(),["Ada30","Bea10","Cy20"]);
 await page.getByLabel("Filter",{exact:true}).fill("");
 await page.getByRole("button",{name:"Toggle manual"}).click();
 await page.getByRole("button",{name:"Next",exact:true}).click();
 assert.equal(await page.getByRole("button",{name:"Next",exact:true}).isEnabled(),false);
 await page.getByRole("button",{name:"Toggle ownership"}).click();
 await page.getByLabel("Filter",{exact:true}).fill("missing");
 assert.deepEqual(await names(),["No results."]);
 assert.equal(await page.getByLabel("Parent filter",{exact:true}).textContent(),"");
 await page.getByRole("button",{name:"Toggle ownership"}).click();
 // Restoring the parent query changes the filtered model. Native client
 // pagination resets to page 1 after that model update is committed.
 await expect(page.getByLabel("Filter",{exact:true})).toHaveValue("");
 await expect(page.getByLabel("Page",{exact:true})).toHaveText("1");
 await expect(table.locator("tbody tr")).toHaveText(["Cy20","Bea10"]);
 await page.getByLabel("Filter",{exact:true}).fill("Ada");
 await expect(page.getByLabel("Parent filter",{exact:true})).toHaveText("Ada");
 assert.deepEqual(await names(),["Ada30"]);
 const uncontrolled = page.getByRole("table",{name:"Uncontrolled",exact:true});
 await uncontrolled.getByRole("button",{name:"Name",exact:true}).click();
 await uncontrolled.getByRole("button",{name:"Name",exact:true}).click();
 assert.deepEqual(await uncontrolled.locator("tbody tr").allTextContents(),["Cy20","Bea10","Ada30"]);
 await uncontrolled.getByRole("checkbox",{name:"Select Ada"}).check();
 assert.equal(await uncontrolled.getByRole("checkbox",{name:"Select Ada"}).isChecked(),true);
 assert.deepEqual(errors,[]);
 console.info("Data Table: real SSR/hydration, grouped headers, controlled/uncontrolled sorting/filter/selection/visibility/pagination, manual bypass and unmount/remount passed");
} finally {await browser?.close();server.stop(true);await rm(directory,{recursive:true,force:true});}
