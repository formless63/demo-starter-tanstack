import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

interface AddOnMetadata {
	addOnId: string;
	sourceDirectory: string;
	manifestPath: string;
	distributablePath: string;
	cleanInstallFixture: string;
	dependsOn: string[];
	conflictsWith: string[];
}

interface Capability {
	id: string;
	status: string;
	tanstackAddOn?: AddOnMetadata;
}

interface Catalog {
	capabilities: Capability[];
}

interface CleanInstallFixture {
	projectName: string;
	framework: "React" | "Solid";
	blank: boolean;
	packageManager: "bun" | "npm" | "pnpm" | "yarn";
	toolchain: "biome" | "eslint";
	addOnConfig?: Record<string, unknown>;
	expectedOfficialAddOns: string[];
	expectedFiles: string[];
	build: boolean;
}

interface AddOnManifest {
	id: string;
	dependsOn?: string[];
	packageAdditions?: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	};
}

interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

interface CtaJson {
	chosenAddOns?: string[];
}

const root = process.cwd();
const cliPath = resolve(root, "node_modules/.bin/tanstack");

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

async function run(command: string, args: string[], cwd: string) {
	const child = spawn(command, args, {
		cwd,
		env: { ...process.env, TANSTACK_CLI_TELEMETRY_DISABLED: "1" },
		stdio: "inherit",
	});
	const exitCode = await new Promise<number>((resolveExit, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => resolveExit(code ?? 1));
	});
	if (exitCode !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with ${exitCode}`);
	}
}

function selectedAddOns(catalog: Catalog, requested: string[]) {
	const addOns = catalog.capabilities.filter(
		(capability): capability is Capability & { tanstackAddOn: AddOnMetadata } =>
			capability.tanstackAddOn !== undefined,
	);
	if (requested.length === 0) return addOns;
	const requestedSet = new Set(requested);
	const selected = addOns.filter(({ id }) => requestedSet.has(id));
	const unknown = requested.filter((id) => !selected.some((capability) => capability.id === id));
	if (unknown.length > 0) throw new Error(`Unknown custom add-on capabilities: ${unknown.join(", ")}`);
	return selected;
}

async function compile(capability: Capability & { tanstackAddOn: AddOnMetadata }, verifyClean: boolean) {
	const sourceDirectory = resolve(root, capability.tanstackAddOn.sourceDirectory);
	const capabilityDirectory = dirname(sourceDirectory);
	const distributablePath = resolve(root, capability.tanstackAddOn.distributablePath);
	const before = verifyClean && existsSync(distributablePath) ? await readFile(distributablePath, "utf8") : undefined;

	await run(cliPath, ["add-on", "compile"], capabilityDirectory);

	if (verifyClean && before !== (await readFile(distributablePath, "utf8"))) {
		throw new Error(`${capability.id}: compiled distributable is stale; run bun run add-ons:compile`);
	}
	console.info(`${capability.id}: compiled ${capability.tanstackAddOn.distributablePath}`);
}

async function withAddOnServer<T>(distributablePath: string, work: (url: string) => Promise<T>) {
	const payload = await readFile(distributablePath);
	const server = createServer((request, response) => {
		if (request.url !== "/add-on.json") {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { "content-type": "application/json" }).end(payload);
	});
	await new Promise<void>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const { port } = server.address() as AddressInfo;
	try {
		return await work(`http://127.0.0.1:${port}/add-on.json`);
	} finally {
		await new Promise<void>((resolveClose, reject) =>
			server.close((error) => (error ? reject(error) : resolveClose())),
		);
	}
}

function assertRecordContains(
	actual: Record<string, string> | undefined,
	expected: Record<string, string> | undefined,
	label: string,
) {
	for (const [key, value] of Object.entries(expected ?? {})) {
		if (actual?.[key] !== value) throw new Error(`${label}: expected ${key}=${value}`);
	}
}

async function cleanInstall(capability: Capability & { tanstackAddOn: AddOnMetadata }) {
	const fixture = await readJson<CleanInstallFixture>(
		resolve(root, capability.tanstackAddOn.cleanInstallFixture),
	);
	const manifest = await readJson<AddOnManifest>(resolve(root, capability.tanstackAddOn.manifestPath));
	const distributablePath = resolve(root, capability.tanstackAddOn.distributablePath);
	const temporaryRoot = await mkdtemp(resolve(tmpdir(), `${capability.id}-addon-`));
	const target = resolve(temporaryRoot, fixture.projectName);

	try {
		await withAddOnServer(distributablePath, async (url) => {
			const args = [
				"create",
				fixture.projectName,
				"--framework",
				fixture.framework,
				...(fixture.blank ? ["--blank"] : []),
				"--package-manager",
				fixture.packageManager,
				"--toolchain",
				fixture.toolchain,
				"--add-ons",
				url,
				"--no-git",
				"--no-intent",
				"--yes",
				"--target-dir",
				target,
			];
			if (fixture.addOnConfig) args.push("--add-on-config", JSON.stringify(fixture.addOnConfig));
			await run(cliPath, args, root);
		});

		const cta = await readJson<CtaJson>(resolve(target, ".cta.json"));
		for (const dependency of fixture.expectedOfficialAddOns) {
			if (!cta.chosenAddOns?.includes(dependency)) {
				throw new Error(`${capability.id}: clean install did not resolve official add-on ${dependency}`);
			}
		}
		for (const path of fixture.expectedFiles) {
			if (!existsSync(resolve(target, path))) throw new Error(`${capability.id}: clean install is missing ${path}`);
		}

		const installedPackage = await readJson<PackageJson>(resolve(target, "package.json"));
		assertRecordContains(installedPackage.dependencies, manifest.packageAdditions?.dependencies, `${capability.id} dependencies`);
		assertRecordContains(installedPackage.devDependencies, manifest.packageAdditions?.devDependencies, `${capability.id} devDependencies`);
		assertRecordContains(installedPackage.scripts, manifest.packageAdditions?.scripts, `${capability.id} scripts`);
		if (fixture.build) await run(process.execPath, ["run", "build"], target);
		console.info(`${capability.id}: clean install passed with ${manifest.dependsOn?.join(", ") || "no"} official dependencies`);
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

const [command, ...requested] = process.argv.slice(2);
const catalog = await readJson<Catalog>(resolve(root, "capabilities/catalog.json"));
const addOns = selectedAddOns(catalog, requested);

if (command === "matrix") {
	console.info(JSON.stringify(addOns.filter(({ status }) => status === "done").map(({ id }) => id)));
} else if (command === "compile") {
	for (const capability of addOns) await compile(capability, false);
} else if (command === "test") {
	for (const capability of addOns) {
		await compile(capability, true);
		await cleanInstall(capability);
	}
} else {
	throw new Error("Usage: bun scripts/add-ons.ts <matrix|compile|test> [capability-id ...]");
}
