import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { run, type Runner } from "./common.ts";

export function governed(path: string): boolean {
	return (
		["capabilities/", ".agents/", ".claude/", ".codex/", ".gemini/"].some(
			(prefix) => path.startsWith(prefix),
		) ||
		[
			"ROADMAP.md",
			"docs/CAPABILITIES.md",
			"docs/STARTING-A-PROJECT.md",
			"AGENTS.md",
			"CLAUDE.md",
		].includes(path) ||
		/^scripts\/capabilities-[^/]+\.ts$/.test(path)
	);
}
export function agentHarness(path: string): boolean {
	return (
		[".agents/", ".claude/", ".codex/", ".gemini/"].some((prefix) =>
			path.startsWith(prefix),
		) ||
		[
			"AGENTS.md",
			"CLAUDE.md",
			"scripts/agents-check.ts",
			"scripts/agent-hooks.test.ts",
			"scripts/agents-vitest.config.ts",
		].includes(path)
	);
}
export function projectSurface(path: string): boolean {
	return (
		[
			".project/",
			".agents/schemas/",
			"docs/templates/project/",
			".agents/skills/project-onboarding/",
			".agents/skills/appearance-change/",
			"appearance/",
		].some((prefix) => path.startsWith(prefix)) ||
		[
			"PROJECT.md",
			"SPEC.md",
			"DESIGN.md",
			".agents/prompts/onboard-project.md",
			"docs/PROJECT-ONBOARDING.md",
			"docs/APPEARANCE.md",
			"src/theme.css",
			"src/styles.css",
			"src/appearance-policy.ts",
		].includes(path) ||
		/^scripts\/(?:lib\/)?(?:project|theme)(?:[-.][^/]*)?\.ts$/.test(path)
	);
}
function projectDocuments(root: string): string[] {
	const file = resolve(root, ".project/config.json");
	try {
		if (!existsSync(file) || statSync(file).size > 512 * 1024) return [];
		const documents = JSON.parse(readFileSync(file, "utf8")).documents;
		return Object.values(documents).filter(
			(path): path is string => typeof path === "string" && path.length <= 240,
		);
	} catch {
		return [];
	}
}
export function qualityGate(
	root: string,
	execute: Runner = run,
): string | undefined {
	const status = execute(root, "git", ["status", "--porcelain=v1", "-z"]);
	if (!status.ok)
		return "Quality gate: cannot inspect Git worktree; check repository access.";
	if (!status.output) return;
	const failed: string[] = [];
	for (const args of [
		["diff", "--check"],
		["diff", "--cached", "--check"],
	]) {
		if (!execute(root, "git", args).ok) failed.push(`git ${args.join(" ")}`);
	}
	// Separate NUL-delimited path lists handle spaces, renames, staged deletions and untracked files.
	const paths: string[] = [];
	for (const args of [
		["diff", "--name-only", "-z", "--no-renames"],
		["diff", "--cached", "--name-only", "-z", "--no-renames"],
		["ls-files", "--others", "--exclude-standard", "-z"],
	]) {
		const result = execute(root, "git", args);
		if (!result.ok)
			return "Quality gate: cannot list changed paths; check Git access.";
		paths.push(...result.output.split("\0").filter(Boolean));
	}
	if (
		paths.some(governed) &&
		!execute(root, "bun", ["run", "capabilities:check"], 10000).ok
	)
		failed.push("bun run capabilities:check");
	if (
		paths.some(agentHarness) &&
		!execute(root, "bun", ["run", "agents:check"], 10000).ok
	)
		failed.push("bun run agents:check");
	const documents = projectDocuments(root);
	if (
		paths.some((path) => projectSurface(path) || documents.includes(path)) &&
		!execute(root, "bun", ["run", "project:check"], 10000).ok
	)
		failed.push("bun run project:check");
	return failed.length
		? `Fix the deterministic quality check failure(s), then retry: ${failed.join("; ")}.`
		: undefined;
}
