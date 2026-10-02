import {
	existsSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
} from "node:fs";
import { resolve } from "node:path";
import { object } from "../.agents/hooks/common.ts";

export function checkAgents(root: string): string[] {
	const errors: string[] = [];
	const requirePath = (path: string) => {
		if (!existsSync(resolve(root, path))) errors.push(`Missing ${path}`);
	};
	for (const path of [
		"AGENTS.md",
		".agents/context",
		".agents/prompts",
		".agents/skills",
		".agents/hooks",
	])
		requirePath(path);
	for (const directory of [
		".agents/context",
		".agents/prompts",
		".agents/skills",
		".agents/hooks",
	]) {
		if (
			existsSync(resolve(root, directory)) &&
			!statSync(resolve(root, directory)).isDirectory()
		)
			errors.push(`${directory} must be a directory`);
	}
	if (existsSync(resolve(root, ".agents/skills"))) {
		for (const entry of readdirSync(resolve(root, ".agents/skills"), {
			withFileTypes: true,
		})) {
			if (entry.isDirectory() || entry.isSymbolicLink())
				requirePath(`.agents/skills/${entry.name}/SKILL.md`);
		}
	}
	try {
		if (
			realpathSync(resolve(root, ".claude/skills")) !==
			realpathSync(resolve(root, ".agents/skills"))
		)
			errors.push(".claude/skills must point to canonical .agents/skills");
		const claude = resolve(root, "CLAUDE.md");
		if (
			realpathSync(claude) !== realpathSync(resolve(root, "AGENTS.md")) &&
			!/@AGENTS\.md|(?:read|follow|canonical)[^\n]*AGENTS\.md/i.test(
				readFileSync(claude, "utf8"),
			)
		)
			errors.push("CLAUDE.md must canonicalize AGENTS.md");
	} catch {
		errors.push("Missing canonical Claude guidance/skills adapter");
	}
	try {
		const catalog = JSON.parse(
			readFileSync(resolve(root, "capabilities/catalog.json"), "utf8"),
		);
		for (const capability of catalog.capabilities)
			if (capability.agentSkill) requirePath(capability.agentSkill);
	} catch {
		errors.push("Cannot read capability catalog");
	}
	for (const [provider, file, before, stop, base] of [
		[
			"claude",
			".claude/settings.json",
			"PreToolUse",
			"Stop",
			"$CLAUDE_PROJECT_DIR",
		],
		[
			"codex",
			".codex/hooks.json",
			"PreToolUse",
			"Stop",
			"$(git rev-parse --show-toplevel)",
		],
		[
			"gemini",
			".gemini/settings.json",
			"BeforeTool",
			"AfterAgent",
			"$GEMINI_PROJECT_DIR",
		],
	]) {
		try {
			const settings = object(
				JSON.parse(readFileSync(resolve(root, file), "utf8")),
			);
			if (
				provider === "gemini" &&
				object(settings.context).fileName !== "AGENTS.md"
			)
				errors.push(`${file}: context.fileName must remain AGENTS.md`);
			const hooks = object(settings.hooks);
			for (const [event, phase] of [
				["SessionStart", "session"],
				[before, "guard"],
				[stop, "quality"],
			]) {
				const groups = hooks[event];
				if (!Array.isArray(groups) || groups.length !== 1) {
					errors.push(`${file}: expected one ${event} adapter`);
					continue;
				}
				const group = object(groups[0]);
				const handlers = group.hooks;
				if (!Array.isArray(handlers) || handlers.length !== 1) {
					errors.push(`${file}: invalid ${event} handlers`);
					continue;
				}
				const handler = object(handlers[0]);
				const expected = `sh "${base}/.agents/hooks/run.sh" ${phase} ${provider} "${base}"`;
				if (handler.type !== "command" || handler.command !== expected)
					errors.push(
						`${file}: ${event} must invoke the portable shared launcher; no user-specific paths`,
					);
				if (
					typeof handler.timeout !== "number" ||
					handler.timeout <= 0 ||
					handler.timeout > (provider === "gemini" ? 15000 : 15)
				)
					errors.push(`${file}: ${event} timeout is invalid`);
				if (
					event === "SessionStart" &&
					group.matcher !==
						(provider === "gemini"
							? "startup|resume|clear"
							: "startup|resume|clear|compact")
				)
					errors.push(`${file}: unsupported session matcher`);
				if (
					event === before &&
					group.matcher !==
						(provider === "gemini"
							? "run_shell_command|write_file|replace"
							: "Bash|Write|Edit|MultiEdit|apply_patch")
				)
					errors.push(`${file}: unsupported tool matcher`);
			}
			if (
				Object.keys(hooks).some(
					(event) => !["SessionStart", before, stop].includes(event),
				)
			)
				errors.push(
					`${file}: unexpected hook event; review before extending automation`,
				);
		} catch {
			errors.push(`Cannot parse ${file}`);
		}
	}
	for (const file of [
		"run.sh",
		"dispatch.ts",
		"common.ts",
		"session-context.ts",
		"tool-guard.ts",
		"quality-gate.ts",
	])
		requirePath(`.agents/hooks/${file}`);
	return errors;
}
if (process.argv[1]?.endsWith("agents-check.ts")) {
	const errors = checkAgents(process.cwd());
	if (errors.length) {
		console.error(errors.join("\n"));
		process.exit(1);
	}
	console.info(
		"Agent harness is valid: canonical guidance, skills and portable project hook adapters agree.",
	);
}
