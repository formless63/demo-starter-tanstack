import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface Capability {
	id: string;
	status: string;
	defaultInstalled: boolean;
	requires: string[];
	integratesWith: string[];
	baselineRequirements: string[];
	baselineIntegrations?: string[];
	externalRequirements: Array<{ name: string }>;
	scripts?: string[];
	documentationPath?: string;
	agentSkill?: string;
	evaluationDocument?: string;
	tanstackAddOn?: {
		addOnId: string;
		sourceDirectory: string;
		manifestPath: string;
		distributablePath: string;
		cleanInstallFixture: string;
		dependsOn: string[];
		conflictsWith: string[];
	};
}

interface Catalog {
	baseline: { components: Array<{ id: string }> };
	referenceApplication: { enabledCapabilities: string[] };
	frameworkEvaluations: Record<string, Array<{ id: string }>>;
	capabilities: Capability[];
}

const root = process.cwd();
const catalogPath = resolve(root, "capabilities/catalog.json");
const schemaPath = resolve(root, "capabilities/catalog.schema.json");
const errors: string[] = [];

function readJson(path: string): Json {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as Json;
	} catch (error) {
		throw new Error(`Cannot read JSON at ${path}: ${String(error)}`);
	}
}

function isObject(value: Json): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(left: Json, right: Json) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function resolveReference(rootSchema: Json, reference: string): Json {
	if (!reference.startsWith("#/")) {
		throw new Error(`Only local schema references are supported: ${reference}`);
	}
	let current = rootSchema;
	for (const segment of reference
		.slice(2)
		.split("/")
		.map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
		if (!isObject(current) || !(segment in current)) {
			throw new Error(`Unresolvable schema reference: ${reference}`);
		}
		current = current[segment];
	}
	return current;
}

function validateSchema(
	value: Json,
	schema: Json,
	path: string,
	rootSchema: Json,
) {
	if (!isObject(schema)) {
		errors.push(`${path}: schema node must be an object`);
		return;
	}
	if (typeof schema.$ref === "string") {
		validateSchema(value, resolveReference(rootSchema, schema.$ref), path, rootSchema);
		return;
	}
	if (Array.isArray(schema.enum) && !schema.enum.some((item) => sameJson(value, item))) {
		errors.push(`${path}: value is not in the declared enum`);
	}
	if ("const" in schema && !sameJson(value, schema.const)) {
		errors.push(`${path}: value does not match the declared constant`);
	}

	const expectedType = schema.type;
	const typeMatches =
		expectedType === undefined ||
		(expectedType === "object" && isObject(value)) ||
		(expectedType === "array" && Array.isArray(value)) ||
		(expectedType === "string" && typeof value === "string") ||
		(expectedType === "boolean" && typeof value === "boolean") ||
		(expectedType === "number" && typeof value === "number") ||
		(expectedType === "integer" && Number.isInteger(value));
	if (!typeMatches) {
		errors.push(`${path}: expected ${String(expectedType)}`);
		return;
	}

	if (typeof value === "string") {
		if (typeof schema.minLength === "number" && value.length < schema.minLength) {
			errors.push(`${path}: string is shorter than ${schema.minLength}`);
		}
		if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
			errors.push(`${path}: string does not match ${schema.pattern}`);
		}
	}
	if (Array.isArray(value)) {
		if (typeof schema.minItems === "number" && value.length < schema.minItems) {
			errors.push(`${path}: array has fewer than ${schema.minItems} items`);
		}
		if (schema.uniqueItems === true) {
			const serialized = value.map((item) => JSON.stringify(item));
			if (new Set(serialized).size !== serialized.length) {
				errors.push(`${path}: array items must be unique`);
			}
		}
		if (schema.items !== undefined) {
			value.forEach((item, index) =>
				validateSchema(item, schema.items as Json, `${path}[${index}]`, rootSchema),
			);
		}
	}
	if (isObject(value)) {
		const properties = isObject(schema.properties) ? schema.properties : {};
		if (Array.isArray(schema.required)) {
			for (const key of schema.required) {
				if (typeof key === "string" && !(key in value)) {
					errors.push(`${path}: missing required property ${key}`);
				}
			}
		}
		for (const [key, child] of Object.entries(value)) {
			if (key in properties) {
				validateSchema(child, properties[key], `${path}.${key}`, rootSchema);
			} else if (schema.additionalProperties === false) {
				errors.push(`${path}: unexpected property ${key}`);
			}
		}
	}
}

function duplicates(values: string[]) {
	return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

const schema = readJson(schemaPath);
const catalogJson = readJson(catalogPath);
validateSchema(catalogJson, schema, "catalog", schema);

if (!isObject(catalogJson)) {
	errors.push("catalog: expected an object");
} else if (errors.length === 0) {
	const catalog = catalogJson as unknown as Catalog;
	const ids = catalog.capabilities.map(({ id }) => id);
	const idSet = new Set(ids);
	const byId = new Map(catalog.capabilities.map((capability) => [capability.id, capability]));
	for (const id of duplicates(ids)) errors.push(`duplicate capability id: ${id}`);

	const baselineIds = catalog.baseline.components.map(({ id }) => id);
	const baselineSet = new Set(baselineIds);
	const referenceEnabled = new Set(catalog.referenceApplication.enabledCapabilities);
	for (const id of duplicates(baselineIds)) errors.push(`duplicate baseline id: ${id}`);
	for (const id of catalog.referenceApplication.enabledCapabilities) {
		if (!idSet.has(id)) errors.push(`referenceApplication.enabledCapabilities: unknown capability ${id}`);
		if (byId.get(id)?.status !== "done") {
			errors.push(`referenceApplication.enabledCapabilities: ${id} must have status done`);
		}
	}

	for (const capability of catalog.capabilities) {
		for (const relationship of ["requires", "integratesWith"] as const) {
			for (const target of capability[relationship]) {
				if (baselineSet.has(target)) {
					errors.push(`${capability.id}.${relationship}: ${target} is baseline, not a capability module`);
				} else if (!idSet.has(target)) {
					errors.push(`${capability.id}.${relationship}: unknown capability ${target}`);
				}
				if (target === capability.id) {
					errors.push(`${capability.id}.${relationship}: self-reference is impossible`);
				}
			}
		}
		for (const target of capability.requires) {
			if (capability.integratesWith.includes(target)) {
				errors.push(`${capability.id}: ${target} cannot be both required and optional`);
			}
		}
		for (const requirement of capability.baselineRequirements) {
			if (!baselineSet.has(requirement)) {
				errors.push(`${capability.id}.baselineRequirements: unknown baseline ${requirement}`);
			}
		}
		for (const integration of capability.baselineIntegrations ?? []) {
			if (!baselineSet.has(integration)) {
				errors.push(`${capability.id}.baselineIntegrations: unknown baseline ${integration}`);
			}
			if (capability.baselineRequirements.includes(integration)) {
				errors.push(`${capability.id}: ${integration} cannot be both a baseline requirement and integration`);
			}
		}
		for (const name of duplicates(capability.externalRequirements.map(({ name }) => name))) {
			errors.push(`${capability.id}.externalRequirements: duplicate ${name}`);
		}
		if (capability.defaultInstalled && capability.status !== "done") {
			errors.push(`${capability.id}: default-installed capabilities must have status done`);
		}
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	function visit(id: string, trail: string[]) {
		if (visiting.has(id)) {
			errors.push(`hard dependency cycle: ${[...trail, id].join(" -> ")}`);
			return;
		}
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of byId.get(id)?.requires ?? []) visit(dependency, [...trail, id]);
		visiting.delete(id);
		visited.add(id);
	}
	for (const id of ids) visit(id, []);

	const packageJson = readJson(resolve(root, "package.json"));
	const scripts = isObject(packageJson) && isObject(packageJson.scripts) ? packageJson.scripts : {};
	for (const capability of catalog.capabilities.filter(({ status }) => status === "done")) {
		const expectedDocumentationPath = `capabilities/${capability.id}/CAPABILITY.md`;
		if (!capability.documentationPath) {
			errors.push(`${capability.id}: completed capability must declare documentationPath`);
		} else if (capability.documentationPath !== expectedDocumentationPath) {
			errors.push(`${capability.id}: completed capability documentation must be ${expectedDocumentationPath}`);
		} else if (!existsSync(resolve(root, capability.documentationPath))) {
			errors.push(`${capability.id}: missing ${capability.documentationPath}`);
		}
		if (capability.evaluationDocument && !existsSync(resolve(root, capability.evaluationDocument))) {
			errors.push(`${capability.id}: missing ${capability.evaluationDocument}`);
		}
		if (capability.agentSkill && !existsSync(resolve(root, capability.agentSkill))) {
			errors.push(`${capability.id}: missing ${capability.agentSkill}`);
		}
		if (referenceEnabled.has(capability.id)) {
			for (const script of capability.scripts ?? []) {
				if (!(script in scripts)) errors.push(`${capability.id}: enabled reference app is missing package.json script ${script}`);
			}
		}
	}

	if (existsSync(resolve(root, ".add-on")) || existsSync(resolve(root, "add-on.json"))) {
		errors.push("custom add-ons must live under capabilities/<id>, not at the repository root");
	}
	const customAddOns = catalog.capabilities.filter(
		(capability): capability is Capability & { tanstackAddOn: NonNullable<Capability["tanstackAddOn"]> } =>
			capability.tanstackAddOn !== undefined,
	);
	for (const addOnId of duplicates(customAddOns.map(({ tanstackAddOn }) => tanstackAddOn.addOnId))) {
		errors.push(`duplicate TanStack add-on id: ${addOnId}`);
	}
	for (const capability of customAddOns) {
		const addOn = capability.tanstackAddOn;
		const base = `capabilities/${capability.id}`;
		const expectedPaths = {
			sourceDirectory: `${base}/.add-on`,
			manifestPath: `${base}/.add-on/info.json`,
			distributablePath: `${base}/add-on.json`,
			cleanInstallFixture: `${base}/test/clean-install.json`,
		};
		for (const [field, expected] of Object.entries(expectedPaths)) {
			if (addOn[field as keyof typeof expectedPaths] !== expected) {
				errors.push(`${capability.id}.tanstackAddOn.${field} must be ${expected}`);
			}
			if (!existsSync(resolve(root, expected))) errors.push(`${capability.id}: missing ${expected}`);
		}
		if (!existsSync(resolve(root, base, ".cta.json"))) {
			errors.push(`${capability.id}: missing capability-local .cta.json authoring metadata`);
		}
		for (const dependency of addOn.dependsOn) {
			if (addOn.conflictsWith.includes(dependency)) {
				errors.push(`${capability.id}: ${dependency} cannot be both an add-on dependency and conflict`);
			}
		}
		if (addOn.conflictsWith.includes(addOn.addOnId)) {
			errors.push(`${capability.id}: an add-on cannot conflict with itself`);
		}
		if (capability.status === "done") {
			for (const requirement of capability.requires) {
				const requiredCapability = byId.get(requirement);
				if (!requiredCapability?.tanstackAddOn) {
					errors.push(`${capability.id}: required capability ${requirement} has no installable add-on`);
				} else if (!addOn.dependsOn.includes(requiredCapability.tanstackAddOn.addOnId)) {
					errors.push(
						`${capability.id}: add-on dependsOn must include ${requiredCapability.tanstackAddOn.addOnId} for required capability ${requirement}`,
					);
				}
			}
		}

		const manifestPath = resolve(root, addOn.manifestPath);
		const distributablePath = resolve(root, addOn.distributablePath);
		if (existsSync(manifestPath)) {
			const manifest = readJson(manifestPath);
			const manifestId = isObject(manifest) ? manifest.id : undefined;
			if (manifestId !== addOn.addOnId) {
				errors.push(`${capability.id}: source manifest id does not match tanstackAddOn.addOnId`);
			}
			const actualDependsOn = isObject(manifest) && Array.isArray(manifest.dependsOn) ? manifest.dependsOn : [];
			if (!sameJson(actualDependsOn, addOn.dependsOn)) {
				errors.push(`${capability.id}: add-on dependsOn does not match the capability catalog`);
			}
			const additions = isObject(manifest) && isObject(manifest.packageAdditions) ? manifest.packageAdditions : {};
			const addOnScripts = isObject(additions.scripts) ? additions.scripts : {};
			for (const script of capability.scripts ?? []) {
				if (!(script in addOnScripts)) errors.push(`${capability.id}: add-on metadata is missing script ${script}`);
			}
			if (existsSync(distributablePath)) {
				const distributable = readJson(distributablePath);
				if (!isObject(distributable) || distributable.id !== manifestId) {
					errors.push(`${capability.id}: compiled add-on id does not match its source manifest`);
				} else {
					const compiledDependsOn = Array.isArray(distributable.dependsOn) ? distributable.dependsOn : [];
					if (!sameJson(compiledDependsOn, addOn.dependsOn)) {
						errors.push(`${capability.id}: compiled add-on dependsOn does not match the capability catalog`);
					}
				}
			}
		}

		const contractPath = resolve(root, base, "CAPABILITY.md");
		const packagedContractPath = resolve(root, addOn.sourceDirectory, "assets", base, "CAPABILITY.md");
		if (!existsSync(packagedContractPath)) {
			errors.push(`${capability.id}: add-on payload is missing ${base}/CAPABILITY.md`);
		} else if (
			existsSync(contractPath) &&
			readFileSync(contractPath, "utf8") !== readFileSync(packagedContractPath, "utf8")
		) {
			errors.push(`${capability.id}: packaged CAPABILITY.md is out of sync`);
		}

		const fixturePath = resolve(root, addOn.cleanInstallFixture);
		if (existsSync(fixturePath)) {
			const fixture = readJson(fixturePath);
			const expectedOfficialAddOns =
				isObject(fixture) && Array.isArray(fixture.expectedOfficialAddOns)
					? fixture.expectedOfficialAddOns
					: [];
			if (!sameJson(expectedOfficialAddOns, addOn.dependsOn)) {
				errors.push(`${capability.id}: clean-install fixture must exercise every official dependsOn entry`);
			}
		}
	}

	const evaluationIds = Object.values(catalog.frameworkEvaluations).flatMap((items) =>
		items.map(({ id }) => id),
	);
	for (const id of duplicates(evaluationIds)) errors.push(`duplicate framework evaluation id: ${id}`);
}

if (errors.length > 0) {
	console.error("Capability catalog validation failed:");
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.info("Capability catalog is valid: schema, relationships, files, scripts, and add-on metadata agree.");
