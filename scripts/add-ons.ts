import {officialPrerequisitesFirst} from "./add-on-order";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
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
	requires: string[];
	status: string;
	tanstackAddOn?: AddOnMetadata;
}

interface Catalog {
	capabilities: Capability[];
}

interface CleanInstallFixture {
 capabilities?: string[];
 reviewedSharedFiles?: Record<string,string>;
	projectName: string;
	framework: "React" | "Solid";
	blank: boolean;
	packageManager: "bun" | "npm" | "pnpm" | "yarn";
	toolchain: "biome" | "eslint";
	addOnConfig?: Record<string, unknown>;
	expectedOfficialAddOns: string[];
	forbiddenOfficialAddOns?: string[];
	expectedFiles: string[];
	expectedFileText?: Record<string, string[]>;
	verificationCommands?: string[][];
	postBuildVerificationCommands?: string[][];
	cleanupCommands?: string[][];
	verificationEnvironment?: Record<string, string>;
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

async function run(
	command: string,
	args: string[],
	cwd: string,
	environment: NodeJS.ProcessEnv = {},
) {
	const child = spawn(command, args, {
		cwd,
		env: {
			...process.env,
			...environment,
			TANSTACK_CLI_TELEMETRY_DISABLED: "1",
		},
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
	const unknown = requested.filter(
		(id) => !selected.some((capability) => capability.id === id),
	);
	if (unknown.length > 0)
		throw new Error(
			`Unknown custom add-on capabilities: ${unknown.join(", ")}`,
		);
	return selected;
}

async function compile(
	capability: Capability & { tanstackAddOn: AddOnMetadata },
	verifyClean: boolean,
) {
	const sourceDirectory = resolve(
		root,
		capability.tanstackAddOn.sourceDirectory,
	);
	const capabilityDirectory = dirname(sourceDirectory);
	const distributablePath = resolve(
		root,
		capability.tanstackAddOn.distributablePath,
	);
	const before =
		verifyClean && existsSync(distributablePath)
			? await readFile(distributablePath, "utf8")
			: undefined;

	await run(cliPath, ["add-on", "compile"], capabilityDirectory);

	if (verifyClean && before !== (await readFile(distributablePath, "utf8"))) {
		throw new Error(
			`${capability.id}: compiled distributable is stale; run bun run add-ons:compile`,
		);
	}
	console.info(
		`${capability.id}: compiled ${capability.tanstackAddOn.distributablePath}`,
	);
}

// Resolve custom dependency distributables from the catalog; official dependencies remain CLI-owned.
function customDependencyOrder(
	capability: Capability & { tanstackAddOn: AddOnMetadata },
) {
	const ordered: (Capability & { tanstackAddOn: AddOnMetadata })[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();
	function visit(current: Capability & { tanstackAddOn: AddOnMetadata }) {
		if (visiting.has(current.id))
			throw new Error("Custom add-on dependency cycle");
		if (visited.has(current.id)) return;
		visiting.add(current.id);
		for (const id of current.tanstackAddOn.dependsOn) {
			const dependency = catalog.capabilities.find(
				(c) => c.tanstackAddOn?.addOnId === id,
			);
			if (dependency?.tanstackAddOn)
				visit(dependency as Capability & { tanstackAddOn: AddOnMetadata });
		}
		visiting.delete(current.id);
		visited.add(current.id);
		ordered.push(current);
	}
	visit(capability);
	return ordered;
}
async function withAddOnServer<T>(
	capabilities: (Capability & { tanstackAddOn: AddOnMetadata })[],
	work: (urls: string[], aliases: Map<string, string>) => Promise<T>,
) {
	const ordered = [...new Map(capabilities.flatMap(customDependencyOrder).map(c => [c.id,c])).values()];
	const payloads = new Map<string, Buffer>(
		await Promise.all(
			ordered.map(
				async (c) =>
					[
						`/${c.tanstackAddOn.addOnId}.json`,
						await readFile(resolve(root, c.tanstackAddOn.distributablePath)),
					] as const,
			),
		),
	);
	const server = createServer((request, response) => {
		const payload = payloads.get(request.url ?? "");
		if (!payload) {
			response.writeHead(404).end();
			return;
		}
		const manifest = JSON.parse(payload.toString()) as AddOnManifest;
		const address = server.address() as AddressInfo;
		// CLI 0.71 gives remote add-ons their URL as runtime identity. Translate only
		// catalog-known custom dependency references in the served copy, never committed metadata.
		manifest.dependsOn = manifest.dependsOn?.map((id) => {
			const dependency = ordered.find((c) => c.tanstackAddOn.addOnId === id);
			return dependency ? `http://127.0.0.1:${address.port}/${id}.json` : id;
		});
		response
			.writeHead(200, { "content-type": "application/json" })
			.end(JSON.stringify(manifest));
	});
	await new Promise<void>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const { port } = server.address() as AddressInfo;
	try {
		const aliases = new Map(
			ordered.map((c) => [
				c.tanstackAddOn.addOnId,
				`http://127.0.0.1:${port}/${c.tanstackAddOn.addOnId}.json`,
			]),
		);
		const official=officialPrerequisitesFirst(ordered.map(c=>c.tanstackAddOn),new Set(catalog.capabilities.flatMap(c=>c.tanstackAddOn?[c.tanstackAddOn.addOnId]:[])));
 return await work([...official,...aliases.values()], aliases);
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
		if (actual?.[key] !== value)
			throw new Error(`${label}: expected ${key}=${value}`);
	}
}

async function cleanInstall(
	capability: Capability & { tanstackAddOn: AddOnMetadata },
 fixturePath?: string,
) {
	const fixture = await readJson<CleanInstallFixture>(
		resolve(root, fixturePath ?? capability.tanstackAddOn.cleanInstallFixture),
	);
	const manifest = await readJson<AddOnManifest>(
		resolve(root, capability.tanstackAddOn.manifestPath),
	);
	const temporaryRoot = await mkdtemp(
		resolve(tmpdir(), `${capability.id}-addon-`),
	);
	const target = resolve(temporaryRoot, fixture.projectName);

	const chosen = selectedAddOns(catalog, fixture.capabilities ?? [capability.id]);
 const closure = [...new Map(chosen.flatMap(customDependencyOrder).map(c=>[c.id,c])).values()];
 const collisions = installationCollisions(root, closure);
 for (const collision of collisions) {
  if (!Object.keys(fixture.reviewedSharedFiles ?? {}).some(path => collision.path === path || collision.path.startsWith(`${path}/`))) throw new Error(`Review shared add-on file before installation: ${collision.path}`);
 }
 let installedAliases = new Map<string, string>();
	let verificationStarted = false;
	const verificationEnvironment = () => {
		const databaseUrl = process.env.ADD_ON_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
		return {
			...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "add-on-test-secret-with-at-least-32-characters",
			APP_BASE_URL: process.env.APP_BASE_URL ?? "http://127.0.0.1:3000",
			NODE_ENV: "test",
			...Object.fromEntries(
				Object.entries(fixture.verificationEnvironment ?? {}).map(([key, value]) => [
					key,
					value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_match, name: string) =>
						(name === "DATABASE_URL" ? databaseUrl : process.env[name]) ?? "",
					),
				]),
			),
		};
	};
	const verify = async (commands: string[][] = []) => {
		for (const [command, ...args] of commands) {
			if (!command) throw new Error(`${capability.id}: verification command cannot be empty`);
			await run(command, args, target, verificationEnvironment());
		}
	};
	try {
		await withAddOnServer(chosen, async (urls, aliases) => {
			installedAliases = aliases;
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
				urls.join(","),
				"--no-git",
				"--no-intent",
				"--yes",
				"--target-dir",
				target,
			];
			if (fixture.addOnConfig)
				args.push("--add-on-config", JSON.stringify(fixture.addOnConfig));
			await run(cliPath, args, root);
		});

		for (const [targetPath, sourcePath] of Object.entries(fixture.reviewedSharedFiles ?? {})) {
   const source = resolve(root,sourcePath); const destination = resolve(target,targetPath);
   if (!source.startsWith(`${root}/`) || !destination.startsWith(`${target}/`)) throw new Error("Shared-file review path escapes fixture root");
   await cp(source,destination,{recursive:true});
  }
		const cta = await readJson<CtaJson>(resolve(target, ".cta.json"));
		for (const dependency of fixture.expectedOfficialAddOns) {
			if (
				!cta.chosenAddOns?.includes(
					installedAliases.get(dependency) ?? dependency,
				)
			) {
				throw new Error(
					`${capability.id}: clean install did not resolve official add-on ${dependency}`,
				);
			}
		}
		for (const dependency of fixture.forbiddenOfficialAddOns ?? []) {
			if (
				cta.chosenAddOns?.includes(
					installedAliases.get(dependency) ?? dependency,
				)
			)
				throw new Error(
					`${capability.id}: unexpected dependency ${dependency}`,
				);
		}
		for (const path of fixture.expectedFiles) {
			if (!existsSync(resolve(target, path)))
				throw new Error(`${capability.id}: clean install is missing ${path}`);
		}
		for (const [path, snippets] of Object.entries(
			fixture.expectedFileText ?? {},
		)) {
			const installedPath = resolve(target, path);
			if (!existsSync(installedPath)) {
				throw new Error(
					`${capability.id}: clean install is missing expected text file ${path}`,
				);
			}
			const installedText = await readFile(installedPath, "utf8");
			for (const snippet of snippets) {
				if (!installedText.includes(snippet)) {
					throw new Error(
						`${capability.id}: ${path} is missing expected text ${JSON.stringify(snippet)}`,
					);
				}
			}
		}

		const installedPackage = await readJson<PackageJson>(
			resolve(target, "package.json"),
		);
		for (const dependency of closure) {
			const dependencyManifest = await readJson<AddOnManifest>(
				resolve(root, dependency.tanstackAddOn.manifestPath),
			);
			assertRecordContains(
				installedPackage.dependencies,
				dependencyManifest.packageAdditions?.dependencies,
				`${dependency.id} dependencies`,
			);
			assertRecordContains(
				installedPackage.devDependencies,
				dependencyManifest.packageAdditions?.devDependencies,
				`${dependency.id} devDependencies`,
			);
			assertRecordContains(
				installedPackage.scripts,
				dependencyManifest.packageAdditions?.scripts,
				`${dependency.id} scripts`,
			);
		}
		verificationStarted = true;
		await verify(fixture.verificationCommands);
		if (fixture.build) await run(process.execPath, ["run", "build"], target);
		await verify(fixture.postBuildVerificationCommands);
		console.info(
			`${capability.id}: clean install passed with ${manifest.dependsOn?.join(", ") || "no"} declared add-on dependencies`,
		);
	} finally {
		try {
			if (verificationStarted) await verify(fixture.cleanupCommands);
		} finally {
			await rm(temporaryRoot, { recursive: true, force: true });
		}
	}
}

import { installationCollisions } from "./add-on-policy";

const [command, ...requested] = process.argv.slice(2);
const catalog = await readJson<Catalog>(
	resolve(root, "capabilities/catalog.json"),
);
const addOns = selectedAddOns(catalog, command === "test-composition" ? [] : requested);

if (command === "matrix") {
	console.info(
		JSON.stringify(
			addOns.filter(({ status }) => status === "done" || status === "in-progress").map(({ id }) => id),
		),
	);
} else if (command === "serve") {
	if (addOns.length !== 1)
		throw new Error(
			"Select one capability to serve with its dependency closure",
		);
	await withAddOnServer(
		addOns,
		async (urls) => {
			console.info(`TanStack CLI --add-ons ${urls.join(",")}`);
			console.info(
				"Local dependency transport active until SIGINT/SIGTERM; committed artifacts are unchanged.",
			);
			await new Promise<void>((resolveDone) => {
				process.once("SIGINT", resolveDone);
				process.once("SIGTERM", resolveDone);
			});
		},
	);
} else if (command === "preflight") {
 const closure=[...new Map(addOns.flatMap(customDependencyOrder).map(c=>[c.id,c])).values()];
 const collisions=installationCollisions(root,closure);
 for(const collision of collisions) console.error(`Review required: ${collision.path} (${collision.owners.join(", ")})`);
 if(collisions.length) process.exitCode=1; else console.info("No unreviewed custom add-on collisions");
} else if(command === "test-composition") {
 const fixture = await readJson<CleanInstallFixture>(resolve(root, requested[0]));
 const chosen=selectedAddOns(catalog,fixture.capabilities ?? []);
 for(const c of chosen) await compile(c,true);
 await cleanInstall(chosen[0],requested[0]);
} else if (command === "compile") {
	for (const capability of addOns) await compile(capability, false);
} else if (command === "test") {
	for (const capability of addOns) {
		for (const dependency of customDependencyOrder(capability))
			await compile(dependency, true);
		await cleanInstall(capability);
	}
} else {
	throw new Error(
		"Usage: bun scripts/add-ons.ts <matrix|compile|test|serve> [capability-id ...]",
	);
}
