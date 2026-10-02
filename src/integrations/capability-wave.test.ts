import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import catalog from "../../capabilities/catalog.json";
import pkg from "../../package.json";

const requiredWave = [
	"jobs",
	"api-platform",
	"observability",
	"object-storage",
	"email",
	"webhooks",
	"audit-log",
	"cache-coordination",
];

const completed = catalog.capabilities.filter(
	({ status }) => status === "done",
);

test("the reference app enables the complete optional capability wave", () => {
	// Require this wave while allowing future completed capabilities through discovery.
	expect(completed.map(({ id }) => id)).toEqual(
		expect.arrayContaining(requiredWave),
	);
	expect([...catalog.referenceApplication.enabledCapabilities].sort()).toEqual(
		completed.map(({ id }) => id).sort(),
	);
	for (const id of requiredWave)
		expect(
			completed.find((capability) => capability.id === id)?.defaultInstalled,
		).toBe(false);
	// Email runtime and awaited auth delivery must survive merges from the older base.
	expect(pkg.dependencies.nodemailer).toBeTruthy();
	expect(readFileSync("src/lib/auth.ts", "utf8")).toContain("sendMagicLink");
	expect(readFileSync("src/lib/auth.ts", "utf8")).toContain(
		"await getApplicationEmail().sendEmail",
	);
});

test("the generic lifecycle matrix discovers all completed and authored in-progress add-ons", () => {
	const result = spawnSync(process.execPath, ["scripts/add-ons.ts", "matrix"], {
		encoding: "utf8",
	});
	expect(result.status).toBe(0);
	expect(JSON.parse(result.stdout).sort()).toEqual(
		catalog.capabilities
			.filter(({ status }) => status === "done" || status === "in-progress")
			.filter((capability) => "tanstackAddOn" in capability)
			.map(({ id }) => id)
			.sort(),
	);
});

// Explicit test/lifecycle execution only; no fixture runs on application import/startup.
test("generic lifecycle discovery verifies installed reference boundaries", () => {
	const result = spawnSync(
		process.execPath,
		["scripts/add-ons.ts", "verify-reference"],
		{ stdio: "inherit" },
	);
	expect(result.status).toBe(0);
}, 600000);
