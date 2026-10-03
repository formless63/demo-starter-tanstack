import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
	"ai",
	"search",
	"realtime",
	"notifications",
	"organizations",
	"authorization",
	"feature-flags",
];

const completed = catalog.capabilities.filter(
	({ status }) => status === "done",
);
const identityInProgress = ["organizations", "authorization", "feature-flags"];
const integrated = catalog.capabilities.filter(
	({ status, id }) =>
		status === "done" ||
		(status === "in-progress" && identityInProgress.includes(id)),
);

test("the reference app enables the complete optional capability wave", () => {
	// Require this wave while allowing future completed capabilities through discovery.
	expect(integrated.map(({ id }) => id)).toEqual(
		expect.arrayContaining(requiredWave),
	);
	expect([...catalog.referenceApplication.enabledCapabilities].sort()).toEqual(
		integrated.map(({ id }) => id).sort(),
	);
	for (const id of requiredWave)
		expect(
			integrated.find((capability) => capability.id === id)?.defaultInstalled,
		).toBe(false);
	expect(completed.length).toBeGreaterThanOrEqual(26);
	for (const id of identityInProgress)
		expect(
			catalog.capabilities.find((capability) => capability.id === id)?.status,
		).toBe("in-progress");
	// Email runtime and awaited auth delivery must survive merges from the older base.
	expect(pkg.dependencies.nodemailer).toBeTruthy();
	expect(readFileSync("src/lib/auth.ts", "utf8")).toContain("sendMagicLink");
	expect(readFileSync("src/lib/auth.ts", "utf8")).toContain(
		"await getApplicationEmail().sendEmail",
	);
});

test("the generic lifecycle matrix discovers completed and authored in-progress add-ons", () => {
	const result = spawnSync(process.execPath, ["scripts/add-ons.ts", "matrix"], {
		encoding: "utf8",
	});
	expect(result.status).toBe(0);
	expect(JSON.parse(result.stdout).sort()).toEqual(
		catalog.capabilities
			.filter(
				(capability) =>
					"tanstackAddOn" in capability &&
					capability.tanstackAddOn !== undefined &&
					(capability.status === "done" ||
						(capability.status === "in-progress" &&
							existsSync(capability.tanstackAddOn.cleanInstallFixture))),
			)
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
