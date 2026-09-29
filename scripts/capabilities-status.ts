import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Capability {
	id: string;
	status: string;
	defaultInstalled: boolean;
	requires: string[];
	externalRequirements: Array<{ name: string; required: boolean }>;
	tanstackAddOn?: {
		sourceDirectory: string;
		dependsOn: string[];
	};
}

interface Catalog {
	referenceApplication: { enabledCapabilities: string[] };
	capabilities: Capability[];
}

function list(values: string[]) {
	return values.length > 0 ? values.join(", ") : "none";
}

const root = process.cwd();
const catalog = JSON.parse(
	readFileSync(resolve(root, "capabilities/catalog.json"), "utf8"),
) as Catalog;
const enabled = new Set(catalog.referenceApplication.enabledCapabilities);

for (const capability of catalog.capabilities.filter(
	({ status, tanstackAddOn }) => status === "done" || tanstackAddOn,
)) {
	const addOnPresent = capability.tanstackAddOn
		? existsSync(resolve(root, capability.tanstackAddOn.sourceDirectory))
		: false;
	const external = capability.externalRequirements.map(
		({ name, required }) => `${name}${required ? "" : " (optional)"}`,
	);

	console.info(capability.id);
	console.info(`  status: ${capability.status}`);
	console.info(`  available: ${capability.status === "done" && addOnPresent ? "yes" : "no"}`);
	console.info(`  add-on source present: ${addOnPresent ? "yes" : "no"}`);
	console.info(`  enabled in reference app: ${enabled.has(capability.id) ? "yes" : "no"}`);
	console.info(`  default installed: ${capability.defaultInstalled ? "yes" : "no"}`);
	console.info(`  requires: ${list(capability.requires)}`);
	console.info(`  add-on dependencies: ${list(capability.tanstackAddOn?.dependsOn ?? [])}`);
	console.info(`  external: ${list(external)}`);
}
