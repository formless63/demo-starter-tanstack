import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("Search generic source, official assets and retained distributable agree", async () => {
	const compiled = JSON.parse(
		await readFile("capabilities/search/add-on.json", "utf8"),
	);
	for (const path of [
		"src/integrations/search/schema.ts",
		"src/integrations/search/validation.ts",
		"src/integrations/search/search.server.ts",
		"scripts/search-smoke.ts",
		"scripts/search-clean-fixture.ts",
		"capabilities/search/CAPABILITY.md",
	]) {
		const source = await readFile(path, "utf8");
		expect(
			await readFile(`capabilities/search/.add-on/assets/${path}`, "utf8"),
		).toBe(source);
		expect(compiled.files[path]).toBe(source);
	}
});
