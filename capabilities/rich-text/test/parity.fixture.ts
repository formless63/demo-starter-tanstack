// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test.each([
	"document.ts",
	"RichText.tsx",
	"editor.client.tsx",
	"Example.tsx",
])("independent add-on ships the exact tested runtime: %s", (file) => {
	const reference = readFileSync(
		new URL(`../../../src/integrations/rich-text/${file}`, import.meta.url),
		"utf8",
	);
	const asset = readFileSync(
		new URL(
			`../.add-on/assets/src/integrations/rich-text/${file}`,
			import.meta.url,
		),
		"utf8",
	);
	expect(asset).toBe(reference);
});
