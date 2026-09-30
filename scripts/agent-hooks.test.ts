import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	repositoryRoot,
	response,
	run,
	type Provider,
	type Runner,
} from "../.agents/hooks/common.ts";
import { sessionContext } from "../.agents/hooks/session-context.ts";
import { guard } from "../.agents/hooks/tool-guard.ts";
import { governed, qualityGate } from "../.agents/hooks/quality-gate.ts";
import { checkAgents } from "./agents-check.ts";

const directories: string[] = [];
afterEach(() => {
	for (const root of directories.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function fixture() {
	const root = mkdtempSync(resolve(tmpdir(), "agent-hooks-"));
	directories.push(root);
	for (const args of [
		["init", "-b", "fixture"],
		["config", "user.email", "fixture@example.test"],
		["config", "user.name", "Fixture"],
	])
		expect(run(root, "git", args).ok).toBe(true);
	writeFileSync(resolve(root, "note.md"), "original\n");
	expect(run(root, "git", ["add", "."]).ok).toBe(true);
	expect(run(root, "git", ["commit", "-m", "fixture"]).ok).toBe(true);
	return root;
}
function recording(statusAvailable = false) {
	const calls: string[] = [];
	const execute: Runner = (root, command, args, timeout) => {
		calls.push([command, ...args].join(" "));
		if (command === "bun")
			return {
				ok: statusAvailable,
				output: statusAvailable
					? "jobs\n  status: done\n  enabled in reference app: yes\nDO_NOT_DUMP_SECRET\n"
					: "DO_NOT_DUMP_SECRET",
			};
		return run(root, command, args, timeout);
	};
	return { calls, execute };
}
const providers: Provider[] = ["claude", "codex", "gemini"];
describe.each(providers)("%s fixtures", (provider) => {
	const shell = provider === "gemini" ? "run_shell_command" : "Bash";
	const write = provider === "gemini" ? "write_file" : "Write";
	const root = "/repo/project";
	function payload(name: string, input: unknown) {
		return {
			hook_event_name: provider === "gemini" ? "BeforeTool" : "PreToolUse",
			cwd: root,
			tool_name: name,
			tool_input: input,
		};
	}
	test("session context for clean, dirty and unavailable status never dumps arbitrary output", () => {
		const repo = fixture();
		const runner = recording(true);
		const clean = sessionContext(repo, runner.execute);
		expect(clean).toContain("Branch: fixture; worktree: clean");
		expect(clean).toContain("jobs status=done");
		expect(clean).not.toContain("DO_NOT_DUMP_SECRET");
		writeFileSync(
			resolve(repo, ".env.local"),
			"SECRET_TEST_VALUE=private-value\n",
		);
		const dirty = sessionContext(repo, recording().execute);
		expect(dirty).toContain("worktree: dirty");
		expect(dirty).toContain("temporarily unavailable");
		expect(dirty).not.toMatch(/SECRET_TEST_VALUE|private-value/);
		expect(response(provider, "session", dirty)).toHaveProperty(
			"hookSpecificOutput.additionalContext",
			dirty,
		);
	});
	test.each([
		"git reset --hard",
		'git reset --hard; echo "$RESULT"',
		'git reset --hard "$REF"',
		"git -C /repo/project reset --hard HEAD",
		"git clean -fd",
		"git clean -fdx",
		"git clean -d -ff",
		"git clean --force --directories",
		"git push --force",
		"git push --force-with-lease=main",
		"git push -f",
		"git push origin +main",
		"rm -rf /repo/project",
		"rm -r .git",
		"rm -rf ./src/..",
		"rm --recursive /repo/project/.git/objects",
		"cd /repo/project; rm -rf .",
	])("blocks %s synthetically", (command) => {
		const result = guard(payload(shell, { command }), root);
		expect(result.deny).toBeTruthy();
		const output = response(provider, "guard", result.deny);
		if (provider === "gemini") expect(output.decision).toBe("deny");
		else
			expect(output).toHaveProperty(
				"hookSpecificOutput.permissionDecision",
				"deny",
			);
	});
	test.each([
		"git status",
		"printf 'git reset --hard'",
		"git clean -ndx",
		"git push origin work",
		"rm -rf .output",
		"rm -rf /tmp/disposable-test",
		"cd /tmp/disposable-test; rm -rf .",
		"docker compose down --volumes",
		"bun run storage:compat",
		"cat .env.local",
	])("allows %s", (command) => {
		expect(guard(payload(shell, { command }), root).deny).toBeUndefined();
	});
	test("secret writes deny, templates/read operations allow, ambiguous input warns", () => {
		for (const path of [
			".env",
			".env.local",
			".env.production",
			"/repo/project/.env.production.local",
		])
			expect(
				guard(payload(write, { file_path: path }), root).deny,
			).toBeTruthy();
		for (const path of [
			".env.example",
			".env.sample",
			".env.production.example",
		])
			expect(
				guard(payload(write, { file_path: path }), root).deny,
			).toBeUndefined();
		expect(
			guard(
				payload(provider === "gemini" ? "replace" : "Edit", {
					file_path: ".env.local",
				}),
				root,
			).deny,
		).toBeTruthy();
		expect(guard(payload("Read", { file_path: ".env.local" }), root)).toEqual(
			{},
		);
		expect(
			guard(payload(shell, { command: 'rm -rf "$TARGET"' }), root).warning,
		).toBeTruthy();
		expect(guard({}, root).warning).toBeTruthy();
		expect(response(provider, "guard")).toEqual({});
	});
	test("quality no-op, whitespace and client retry feedback", () => {
		const repo = fixture();
		const runner = recording(true);
		expect(qualityGate(repo, runner.execute)).toBeUndefined();
		expect(runner.calls).toHaveLength(1);
		writeFileSync(resolve(repo, "note.md"), "trailing   \n");
		const error = qualityGate(repo, runner.execute);
		expect(error).toContain("git diff --check");
		expect(runner.calls).toContain("git diff --cached --check");
		expect(runner.calls).not.toContain("bun run capabilities:check");
		expect(response(provider, "quality", error)).toEqual({
			decision: provider === "gemini" ? "deny" : "block",
			reason: error,
		});
		expect(run(repo, "git", ["add", "note.md"]).ok).toBe(true);
		expect(qualityGate(repo, runner.execute)).toContain(
			"git diff --cached --check",
		);
	});
	test("untracked governance change runs only the cheap capability check", () => {
		const repo = fixture();
		const runner = recording();
		mkdirSync(resolve(repo, ".agents"));
		writeFileSync(resolve(repo, ".agents/new.md"), "governed\n");
		expect(qualityGate(repo, runner.execute)).toContain(
			"bun run capabilities:check",
		);
		expect(runner.calls.filter((call) => call.startsWith("bun"))).toEqual([
			"bun run capabilities:check",
		]);
	});
	test("dispatch consumes real fixture JSON and emits one structured guard decision", () => {
		const result = spawnSync(
			"node",
			[resolve(repositoryRoot, ".agents/hooks/dispatch.ts"), "guard", provider],
			{
				input: JSON.stringify(payload(write, { file_path: ".env.local" })),
				encoding: "utf8",
			},
		);
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(JSON.parse(result.stdout)).toEqual(
			response(
				provider,
				"guard",
				guard(payload(write, { file_path: ".env.local" }), repositoryRoot).deny,
			),
		);
	});
});
test("Codex apply_patch protects secret paths and permits templates", () => {
	for (const action of ["Add File", "Update File", "Delete File", "Move to"]) {
		expect(
			guard(
				{
					tool_name: "apply_patch",
					tool_input: {
						command: `*** Begin Patch\n*** ${action}: .env.local\n*** End Patch`,
					},
				},
				repositoryRoot,
			).deny,
		).toBeTruthy();
	}
	expect(
		guard(
			{
				tool_name: "apply_patch",
				tool_input: {
					command:
						"*** Begin Patch\n*** Add File: .env.example\n+TEMPLATE=\n*** End Patch",
				},
			},
			repositoryRoot,
		).deny,
	).toBeUndefined();
});
test("portable launcher resolves a subdirectory and gracefully falls back without Bun", () => {
	const root = fixture();
	const bin = resolve(root, "bin");
	mkdirSync(bin);
	for (const tool of ["node", "git"]) {
		const location = spawnSync("sh", ["-c", `command -v ${tool}`], {
			encoding: "utf8",
		}).stdout.trim();
		// A script wrapper keeps PATH restricted without changing machine installations.
		writeFileSync(resolve(bin, tool), `#!/bin/sh\nexec "${location}" "$@"\n`, {
			mode: 0o755,
		});
	}
	const result = spawnSync(
		"/bin/sh",
		[
			resolve(repositoryRoot, ".agents/hooks/run.sh"),
			"session",
			"codex",
			repositoryRoot,
		],
		{
			cwd: resolve(repositoryRoot, "src"),
			env: { PATH: bin },
			input: JSON.stringify({
				hook_event_name: "SessionStart",
				source: "resume",
			}),
			encoding: "utf8",
		},
	);
	expect(result.status).toBe(0);
	const context = JSON.parse(result.stdout).hookSpecificOutput
		.additionalContext;
	expect(context).toContain("worktree:");
	expect(context).toContain("temporarily unavailable");
});
test("agent harness validates current adapters and rejects absolute user paths/missing hooks", () => {
	expect(checkAgents(repositoryRoot)).toEqual([]);
	const repo = fixture();
	for (const name of [
		".agents",
		".claude",
		".codex",
		".gemini",
		"AGENTS.md",
		"CLAUDE.md",
		"capabilities",
	])
		cpSync(resolve(repositoryRoot, name), resolve(repo, name), {
			recursive: true,
			verbatimSymlinks: true,
		});
	const config = resolve(repo, ".codex/hooks.json");
	const data = JSON.parse(readFileSync(config, "utf8"));
	data.hooks.Stop[0].hooks[0].command = "bun /Users/alice/hooks.ts";
	writeFileSync(config, JSON.stringify(data));
	expect(checkAgents(repo).join("\n")).toContain("no user-specific paths");
	rmSync(resolve(repo, ".agents/hooks/quality-gate.ts"));
	expect(checkAgents(repo).join("\n")).toContain(
		"Missing .agents/hooks/quality-gate.ts",
	);
});
test("done capability needs an evaluation and complete consumer metadata but not a skill", () => {
	const repo = fixture();
	for (const name of [
		"capabilities",
		".agents",
		"package.json",
		"scripts/capabilities-check.ts",
		"JOBS_MODULE_EVALUATION.md",
		"API_PLATFORM_MODULE_EVALUATION.md",
		"OBSERVABILITY_MODULE_EVALUATION.md",
		"OBJECT_STORAGE_MODULE_EVALUATION.md",
	]) {
		mkdirSync(resolve(repo, name, ".."), { recursive: true });
		cpSync(resolve(repositoryRoot, name), resolve(repo, name), {
			recursive: true,
		});
	}
	const path = resolve(repo, "capabilities/catalog.json");
	const catalog = JSON.parse(readFileSync(path, "utf8"));
	for (const capability of catalog.capabilities) delete capability.agentSkill;
	writeFileSync(path, JSON.stringify(catalog));
	const check = () =>
		spawnSync("node", [resolve(repo, "scripts/capabilities-check.ts")], {
			cwd: repo,
			encoding: "utf8",
		});
	expect(check().status).toBe(0);
	delete catalog.capabilities[0].evaluationDocument;
	writeFileSync(path, JSON.stringify(catalog));
	expect(check().stderr).toContain("must declare evaluationDocument");
	const fixturePath = resolve(
		repo,
		"capabilities/jobs/test/clean-install.json",
	);
	const data = JSON.parse(readFileSync(fixturePath, "utf8"));
	delete data.expectedFiles;
	writeFileSync(fixturePath, JSON.stringify(data));
	expect(check().stderr).toContain("consumer fixture metadata is incomplete");
	expect(
		existsSync(
			resolve(repositoryRoot, "capabilities/jobs/test/clean-install.json"),
		),
	).toBe(true);
});

test.each([
	"capabilities/jobs/CAPABILITY.md",
	"ROADMAP.md",
	"docs/CAPABILITIES.md",
	"docs/STARTING-A-PROJECT.md",
	".agents/hooks/tool-guard.ts",
	".claude/settings.json",
	".codex/hooks.json",
	".gemini/settings.json",
	"AGENTS.md",
	"CLAUDE.md",
	"scripts/capabilities-check.ts",
])("governed path %s triggers capability checking", (path) => {
	expect(governed(path)).toBe(true);
});
test.each([
	"README.md",
	"docs/AGENT-AUTOMATION.md",
	"src/features/projects/example.ts",
])("unrelated path %s skips capability checking", (path) => {
	expect(governed(path)).toBe(false);
});
test("staged governance renames and spaced paths remain governed", () => {
	const root = fixture();
	const runner = recording(true);
	mkdirSync(resolve(root, "capabilities"));
	writeFileSync(resolve(root, "capabilities/spaced name.md"), "metadata\n");
	expect(run(root, "git", ["add", "."]).ok).toBe(true);
	expect(qualityGate(root, runner.execute)).toBeUndefined();
	expect(runner.calls).toContain("bun run capabilities:check");
});
