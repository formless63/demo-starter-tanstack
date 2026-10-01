import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	realpathSync,
	lstatSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { lookup } from "node:dns/promises";
import {
	configSchema,
	colorModeSchema,
	colorTokens,
	tokenKeys,
	safePublicUrl,
	safeToken,
	validateTheme,
	type Theme,
} from "./project-contracts.ts";
import { readJson, repositoryFile } from "./project-files.ts";

export const maxThemeBytes = 128 * 1024;
export const defaultMode = {
	supported: ["light", "dark"] as ("light" | "dark")[],
	default: "system" as const,
	userSelectable: true,
};
export type ColorModePolicy = ReturnType<typeof colorModeSchema.parse>;
export function validateMode(mode: ColorModePolicy) {
	if (
		new Set(mode.supported).size !== mode.supported.length ||
		(mode.default === "system"
			? mode.supported.length !== 2
			: !mode.supported.includes(mode.default))
	)
		throw new Error("Invalid color mode policy.");
	return mode;
}
function object(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected theme JSON object.");
	return value as Record<string, unknown>;
}
const ignoredHelpers = new Set([
	"tracking-tighter",
	"tracking-tight",
	"tracking-wide",
	"tracking-wider",
	"tracking-widest",
	"shadow-color",
	"shadow-opacity",
	"shadow-blur",
	"shadow-spread",
	"shadow-offset-x",
	"shadow-offset-y",
	"letter-spacing",
]);
function reviewedMap(input: unknown): Partial<Theme["tokens"]["light"]> {
	const result: Partial<Theme["tokens"]["light"]> = {};
	for (const [key, value] of Object.entries(object(input))) {
		if (ignoredHelpers.has(key)) continue;
		if (!(tokenKeys as readonly string[]).includes(key))
			throw new Error("Registry contains an unknown semantic token key.");
		if (typeof value !== "string" || !safeToken(key, value))
			throw new Error("Registry contains an invalid semantic token value.");
		result[key as (typeof tokenKeys)[number]] = value;
	}
	return result;
}
export function normalizeTheme(
	input: unknown,
	fallback: Theme,
	reference: string,
	kind: "tweakcn" | "shadcn-registry" = "shadcn-registry",
): Theme {
	const item = object(input);
	if (item.schemaVersion !== undefined) return validateTheme(input);
	if (item.type !== "registry:style")
		throw new Error("Only registry:style JSON is supported.");
	const vars = object(item.cssVars);
	const shared = reviewedMap(vars.theme ?? {});
	const light = reviewedMap(vars.light);
	const dark = reviewedMap(vars.dark);
	if (
		!light.background ||
		!light.foreground ||
		!dark.background ||
		!dark.foreground
	)
		throw new Error(
			"Registry needs light/dark background and foreground tokens.",
		);
	return validateTheme({
		schemaVersion: 1,
		name: item.name,
		source: { type: kind, reference },
		tokens: {
			theme: shared,
			light: { ...fallback.tokens.light, ...shared, ...light },
			dark: { ...fallback.tokens.dark, ...shared, ...dark },
		},
	});
}
export function parseThemeInput(bytes: Uint8Array): unknown {
	if (bytes.byteLength > maxThemeBytes)
		throw new Error("Theme JSON exceeds 128 KiB.");
	try {
		return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		throw new Error("Invalid UTF-8 theme JSON.");
	}
}
export function publicAddress(address: string): boolean {
	if (address.includes(":"))
		return (
			/^[23][\da-f]{3}:/i.test(address) &&
			!/^2001:(?:db8|0):|^2002:/i.test(address)
		);
	const parts = address.split(".").map(Number);
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	)
		return false;
	const [a, b] = parts;
	return !(
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && (b === 168 || b === 0)) ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 198 && (b === 18 || b === 19))
	);
}
export async function fetchThemeJson(
	url: string,
	fetcher: typeof fetch = fetch,
	resolver: typeof lookup = lookup,
): Promise<unknown> {
	const controller = new AbortController();
	const deadline = setTimeout(() => controller.abort(), 10000);
	const aborted = new Promise<never>((_resolve, reject) =>
		controller.signal.addEventListener("abort", () => reject(new Error()), {
			once: true,
		}),
	);
	try {
		for (let redirects = 0; redirects <= 3; redirects++) {
			if (!safePublicUrl(url)) throw new Error();
			const addresses = await Promise.race([
				resolver(new URL(url).hostname, { all: true }),
				aborted,
			]);
			if (
				!addresses.length ||
				addresses.some(({ address }) => !publicAddress(address))
			)
				throw new Error();
			const response = await Promise.race([
				fetcher(url, {
					redirect: "manual",
					signal: controller.signal,
					headers: { accept: "application/json" },
				}),
				aborted,
			]);
			if ([301, 302, 303, 307, 308].includes(response.status)) {
				void response.body?.cancel().catch(() => {});
				const location = response.headers.get("location");
				if (!location) throw new Error();
				url = new URL(location, url).href;
				continue;
			}
			if (!response.ok || !response.body) throw new Error();
			const declared = response.headers.get("content-length");
			if (
				declared &&
				(!/^\d+$/.test(declared) || Number(declared) > maxThemeBytes)
			) {
				void response.body.cancel().catch(() => {});
				throw new Error();
			}
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let size = 0;
			try {
				while (true) {
					const next = await Promise.race([reader.read(), aborted]);
					if (next.done) break;
					size += next.value.byteLength;
					if (size > maxThemeBytes) throw new Error();
					chunks.push(next.value);
				}
				const bytes = new Uint8Array(size);
				let offset = 0;
				for (const chunk of chunks) {
					bytes.set(chunk, offset);
					offset += chunk.byteLength;
				}
				return parseThemeInput(bytes);
			} finally {
				void reader.cancel().catch(() => {});
			}
		}
		throw new Error();
	} catch {
		throw new Error(
			"Theme fetch failed: require public HTTPS JSON, bounded size, and a response within 10 seconds.",
		);
	} finally {
		clearTimeout(deadline);
	}
}
export function renderThemeCss(theme: Theme): string {
	validateTheme(theme);
	const block = (selector: string, map: Theme["tokens"]["light"]) =>
		`${selector} {\n${tokenKeys.map((key) => `  --${key}: ${map[key]};`).join("\n")}\n}`;
	const colors = colorTokens.map((key) => `  --color-${key}: var(--${key});`);
	const other = [
		"font-sans",
		"font-serif",
		"font-mono",
		"tracking-normal",
		"spacing",
		"shadow-2xs",
		"shadow-xs",
		"shadow-sm",
		"shadow",
		"shadow-md",
		"shadow-lg",
		"shadow-xl",
		"shadow-2xl",
	].map((key) => `  --${key}: var(--${key});`);
	const radii = [
		"  --radius-sm: calc(var(--radius) - 4px);",
		"  --radius-md: calc(var(--radius) - 2px);",
		"  --radius-lg: var(--radius);",
		"  --radius-xl: calc(var(--radius) + 4px);",
	];
	return `/* Generated by theme:apply. Edit normalized JSON, not this file. */\n${block(":root", theme.tokens.light)}\n\n${block(".dark", theme.tokens.dark)}\n\n@theme inline {\n${[...colors, ...other, ...radii].join("\n")}\n}\n`;
}
export function renderPolicy(mode: ColorModePolicy): string {
	validateMode(mode);
	return `// Generated by theme:apply from the portable project policy.\nexport const appearancePolicy = ${"{\n\tsupported: [" + mode.supported.map((value) => JSON.stringify(value)).join(", ") + "],\n\tdefault: " + JSON.stringify(mode.default) + ",\n\tuserSelectable: " + mode.userSelectable + ",\n}"} as const;\n`;
}
export function themeInputs(root: string): {
	theme: Theme;
	mode: ColorModePolicy;
} {
	let file = existsSync(resolve(root, ".project/theme.json"))
		? ".project/theme.json"
		: "appearance/default-theme.json";
	let mode: ColorModePolicy = defaultMode;
	if (existsSync(resolve(root, ".project/config.json"))) {
		const result = configSchema.safeParse(
			readJson(root, ".project/config.json"),
		);
		if (!result.success) throw new Error("Invalid project appearance profile.");
		file = result.data.appearance.theme.file;
		mode = validateMode(result.data.appearance.colorMode);
		const theme = validateTheme(readJson(root, file));
		const config = result.data.appearance.theme;
		if (
			theme.name !== config.name ||
			theme.source.type !== config.source ||
			theme.source.reference !== config.reference
		)
			throw new Error(
				"Review/update profile theme provenance before applying.",
			);
		return { theme, mode };
	}
	return { theme: validateTheme(readJson(root, file)), mode };
}
// Generated outputs have fixed reviewed destinations. Reject escaping directories/symlinks before writing.
export function writeManaged(
	root: string,
	path: string,
	content: string,
): void {
	const canonical = realpathSync(root);
	const destination = resolve(root, path);
	if (!destination.startsWith(canonical + sep))
		throw new Error("Invalid managed destination.");
	let parent = dirname(destination);
	while (!existsSync(parent)) parent = dirname(parent);
	if (
		realpathSync(parent) !== canonical &&
		!realpathSync(parent).startsWith(canonical + sep)
	)
		throw new Error("Managed destination escapes repository.");
	try {
		if (lstatSync(destination).isSymbolicLink())
			throw new Error("Managed destination cannot be a symlink.");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, content);
}
export function applyTheme(root: string): void {
	const { theme, mode } = themeInputs(root);
	writeManaged(root, "src/theme.css", renderThemeCss(theme));
	writeManaged(root, "src/appearance-policy.ts", renderPolicy(mode));
}
export function checkTheme(root: string): string[] {
	const errors: string[] = [];
	try {
		const { theme, mode } = themeInputs(root);
		for (const [file, expected] of [
			["src/theme.css", renderThemeCss(theme)],
			["src/appearance-policy.ts", renderPolicy(mode)],
		]) {
			if (
				!repositoryFile(root, file) ||
				readFileSync(resolve(root, file), "utf8") !== expected
			)
				errors.push(
					`Managed appearance drift: ${file}; review then run theme:apply.`,
				);
		}
	} catch (error) {
		errors.push(error instanceof Error ? error.message : "Invalid theme.");
	}
	return errors;
}
export async function importTheme(
	root: string,
	source: string,
	kind?: "tweakcn" | "shadcn-registry",
): Promise<Theme> {
	let input: unknown;
	let reference: string;
	if (source.startsWith("https:")) {
		input = await fetchThemeJson(source);
		reference = source;
		kind ??=
			new URL(source).hostname === "tweakcn.com"
				? "tweakcn"
				: "shadcn-registry";
	} else {
		reference = relative(realpathSync(root), resolve(root, source));
		if (!repositoryFile(root, reference))
			throw new Error(
				"Copy supplied theme JSON into the repository before importing.",
			);
		// Bound before allocation, then also bound actual bytes.
		const file = resolve(root, reference);
		const { statSync } = await import("node:fs");
		if (statSync(file).size > maxThemeBytes)
			throw new Error("Theme JSON exceeds 128 KiB.");
		input = parseThemeInput(readFileSync(file));
	}
	const fallback = validateTheme(
		readJson(root, "appearance/default-theme.json"),
	);
	const theme = normalizeTheme(input, fallback, reference, kind);
	writeManaged(
		root,
		".project/theme.json",
		JSON.stringify(theme, null, 2) + "\n",
	);
	return theme;
}
