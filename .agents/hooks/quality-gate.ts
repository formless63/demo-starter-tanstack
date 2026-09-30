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
	return failed.length
		? `Fix the deterministic quality check failure(s), then retry: ${failed.join("; ")}.`
		: undefined;
}
