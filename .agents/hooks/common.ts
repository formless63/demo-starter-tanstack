import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Provider = "claude" | "codex" | "gemini";
export type Payload = Record<string, unknown>;
export const repositoryRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../..",
);
export function object(value: unknown): Payload {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Payload)
		: {};
}
export function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
export function run(
	root: string,
	command: string,
	args: string[],
	timeout = 5000,
) {
	const result = spawnSync(command, args, {
		cwd: root,
		encoding: "utf8",
		timeout,
		maxBuffer: 1024 * 1024,
	});
	return {
		ok: result.status === 0 && !result.error,
		output: result.stdout ?? "",
	};
}
export type Runner = typeof run;
export function response(
	provider: Provider,
	phase: "session" | "guard" | "quality",
	message?: string,
	warning?: string,
	event = "SessionStart",
): Payload {
	if (phase === "session")
		return {
			hookSpecificOutput: { hookEventName: event, additionalContext: message },
		};
	if (phase === "quality")
		return message
			? { decision: provider === "gemini" ? "deny" : "block", reason: message }
			: {};
	// A benign result defers to the client's sandbox/approvals; it never auto-approves.
	if (!message) return warning ? { systemMessage: warning } : {};
	return provider === "gemini"
		? { decision: "deny", reason: message }
		: {
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: message,
				},
			};
}
