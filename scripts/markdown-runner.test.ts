import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("Markdown reference browser test belongs only to Playwright discovery", () => {
 expect(existsSync("e2e/markdown-code.e2e.ts")).toBe(true);
 expect(existsSync("e2e/markdown-code.spec.ts")).toBe(false);
 expect(readFileSync("playwright.config.ts", "utf8")).toContain('testMatch: "**/*.e2e.ts"');
});

test("CI provisions Chromium before generic installed-reference tests", () => {
 const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
 const verify = workflow.slice(workflow.indexOf("\n  verify:"));
 const provision = verify.indexOf("bunx playwright install --with-deps chromium");
 const generic = verify.indexOf("- run: bun test\n");
 const explicitReference = verify.indexOf("bun run add-ons:verify:reference markdown-code");
 expect(provision).toBeGreaterThan(-1);
 expect(generic).toBeGreaterThan(provision);
 expect(explicitReference).toBeGreaterThan(provision);
 // Both the independent lifecycle and reference browser checks remain mandatory.
 const fixture = JSON.parse(readFileSync("capabilities/markdown-code/test/clean-install.json", "utf8"));
 expect(fixture.verificationCommands).toContainEqual(["bun", "run", "markdown-code:browser"]);
 expect(fixture.referenceVerification.commands).toContainEqual(["bun", "run", "markdown-code:browser"]);
});
