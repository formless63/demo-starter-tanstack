import { basename } from "node:path";
import { run, type Runner } from "./common.ts";

export function sessionContext(root: string, execute: Runner = run): string {
	const branch = execute(root, "git", ["branch", "--show-current"]);
	const status = execute(root, "git", ["status", "--porcelain=v1", "-z"]);
	const lines = [
		`${basename(root)} — TanStack Start / React / Bun`,
		`Branch: ${branch.ok ? branch.output.trim() || "detached HEAD" : "unavailable"}; worktree: ${status.ok ? (status.output ? "dirty" : "clean") : "unavailable"}.`,
	];
	const capabilities = execute(
		root,
		"bun",
		["run", "capabilities:status"],
		3000,
	);
	if (capabilities.ok) {
		// Only accept the status command's known fields, never arbitrary output.
		const summaries: string[] = [];
		let id = "";
		for (const line of capabilities.output.split("\n")) {
			if (/^[a-z][a-z0-9-]*$/.test(line)) {
				id = line;
				continue;
			}
			const match =
				/^  (status|available|enabled in reference app|default installed): (done|in-progress|planned|evaluate|deferred|yes|no)$/.exec(
					line,
				);
			if (id && match) summaries.push(`${id} ${match[1]}=${match[2]}`);
		}
		if (summaries.length)
			lines.push(`Capabilities: ${summaries.slice(0, 32).join("; ")}.`);
	} else lines.push("Capabilities: status temporarily unavailable.");
	lines.push(
		"Read AGENTS.md and use the matching .agents/skills workflow before changing a governed domain.",
	);
	return lines.join("\n");
}
