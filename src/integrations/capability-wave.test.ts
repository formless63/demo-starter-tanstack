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
];

const completed = catalog.capabilities.filter(
	({ status }) => status === "done",
);
const identityCapabilities = ["organizations", "authorization", "feature-flags"];

test("accepted reference enablement matches completed capabilities", () => {
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
	expect(completed.length).toBeGreaterThanOrEqual(29);
	// Email runtime and awaited auth delivery must survive merges from the older base.
	expect(pkg.dependencies.nodemailer).toBeTruthy();
	expect(readFileSync("src/lib/auth.ts", "utf8")).toContain("sendMagicLink");
	expect(readFileSync("src/lib/auth.ts", "utf8")).toContain(
		"await getApplicationEmail().sendEmail",
	);
});

test("accepted identity capabilities are reference-enabled and opt-in", () => {
	for (const id of identityCapabilities) {
		const candidate = catalog.capabilities.find(
			(capability) => capability.id === id,
		);
		expect(candidate?.status).toBe("done");
		expect(candidate?.defaultInstalled).toBe(false);
		expect(catalog.referenceApplication.enabledCapabilities).toContain(id);
		expect(existsSync(`capabilities/${id}/.add-on/info.json`)).toBe(true);
		expect(existsSync(`capabilities/${id}/test/clean-install.json`)).toBe(true);
		expect(existsSync(`src/integrations/${id}`)).toBe(true);
	}
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
