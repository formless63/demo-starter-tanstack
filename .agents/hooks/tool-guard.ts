import { basename, isAbsolute, resolve, sep } from "node:path";
import { object, text, type Payload } from "./common.ts";

export interface GuardResult {
	deny?: string;
	warning?: string;
}
const uncertain = {
	warning:
		"Repository guard could not reliably inspect this tool input; use the client's normal sandbox and approval review.",
};

// Deliberately a small lexer, not a shell interpreter. Expansions, nesting and
// control constructs are ambiguous and fail open. Quotes/escapes are never executed.
function commands(source: string): { parsed: string[][]; ambiguous: boolean } {
	const result: string[][] = [];
	let words: string[] = [],
		word = "",
		started = false,
		quote = "";
	const flush = () => {
		if (started) words.push(word);
		word = "";
		started = false;
	};
	const partial = () => ({
		parsed: words.length ? [...result, words] : result,
		ambiguous: true,
	});
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (quote === "'") {
			if (c === "'") quote = "";
			else word += c;
			continue;
		}
		if (c === "\\") {
			if (i + 1 >= source.length) return partial();
			word += source[++i];
			started = true;
			continue;
		}
		if (c === "$" || c === "`") return partial();
		if (quote === '"') {
			if (c === '"') quote = "";
			else word += c;
			continue;
		}
		if (c === "'" || c === '"') {
			quote = c;
			started = true;
			continue;
		}
		if ("(){}<>".includes(c) || c === "#") return partial();
		if (";|&\n".includes(c)) {
			flush();
			if (words.length) result.push(words);
			words = [];
			continue;
		}
		if (/\s/.test(c)) {
			flush();
			continue;
		}
		word += c;
		started = true;
	}
	if (quote) return { parsed: result, ambiguous: true };
	flush();
	if (words.length) result.push(words);
	return { parsed: result, ambiguous: false };
}
function secretFile(path: string): boolean {
	const name = basename(path);
	return (
		(name === ".env" || name.startsWith(".env.")) &&
		!/\.(example|sample)$/.test(name)
	);
}
function protectedRemoval(target: string, cwd: string, root: string): boolean {
	const path = resolve(cwd, target);
	const git = resolve(root, ".git");
	return path === root || path === git || path.startsWith(`${git}${sep}`);
}
export function guard(payload: Payload, root: string): GuardResult {
	const name = text(payload.tool_name);
	const input = object(payload.tool_input);
	const cwd =
		text(input.workdir) ?? text(input.cwd) ?? text(payload.cwd) ?? root;
	if (!name) return uncertain;
	if (["Write", "Edit", "MultiEdit", "write_file", "replace"].includes(name)) {
		const path = text(input.file_path) ?? text(input.path);
		if (!path) return uncertain;
		return secretFile(path)
			? {
					deny: "Direct edits to secret .env files are blocked. Use a template or secure environment configuration.",
				}
			: {};
	}
	if (name === "apply_patch") {
		const patch = text(input.command);
		if (!patch) return uncertain;
		const paths = [
			...patch.matchAll(
				/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm,
			),
		].map((match) => match[1]);
		if (!paths.length) return uncertain;
		return paths.some(secretFile)
			? {
					deny: "Direct patching of secret .env files is blocked. Templates such as .env.example are allowed.",
				}
			: {};
	}
	if (!["Bash", "exec_command", "run_shell_command"].includes(name)) return {};
	const source = text(input.command) ?? text(input.cmd);
	if (!source) return uncertain;
	const { parsed, ambiguous } = commands(source);
	let directory = isAbsolute(cwd) ? resolve(cwd) : resolve(root, cwd);
	for (let words of parsed) {
		while (words[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))
			words = words.slice(1);
		if (["command", "sudo"].includes(words[0])) {
			words = words.slice(1);
			if (words[0]?.startsWith("-")) return uncertain;
		}
		const executable = basename(words[0] ?? "");
		const args = words.slice(1);
		if (executable === "cd") {
			if (args.length !== 1 || /[*?~]/.test(args[0])) return uncertain;
			directory = resolve(directory, args[0]);
			continue;
		}
		if (executable === "git") {
			let offset = 0;
			while (args[offset]?.startsWith("-")) {
				if (["-C", "-c", "--git-dir", "--work-tree"].includes(args[offset]))
					offset += 2;
				else offset++;
			}
			const action = args[offset];
			const flags = args
				.slice(offset + 1)
				.filter((value) => value.startsWith("-"));
			if (action === "reset" && flags.includes("--hard"))
				return {
					deny: "git reset --hard discards repository work; use a scoped non-destructive change.",
				};
			if (
				action === "clean" &&
				!flags.some(
					(value) => value === "--dry-run" || /^-[^-]*n/.test(value),
				) &&
				flags.some((value) => value === "--force" || /^-[^-]*f/.test(value))
			)
				return {
					deny: "Forced git clean deletes untracked work; remove only identified generated files.",
				};
			if (
				action === "push" &&
				(flags.some(
					(value) =>
						value === "--force" ||
						value.startsWith("--force-with-lease") ||
						value.startsWith("--force=") ||
						/^-[^-]*f/.test(value),
				) ||
					args.slice(offset + 1).some((value) => value.startsWith("+")))
			)
				return {
					deny: "Force pushing rewrites remote history; use an ordinary push.",
				};
		}
		if (executable === "rm") {
			let recursive = false,
				options = true;
			const targets: string[] = [];
			for (const arg of args) {
				if (options && arg === "--") {
					options = false;
					continue;
				}
				if (options && arg.startsWith("-")) {
					if (arg === "--recursive" || /^-[^-]*[rR]/.test(arg))
						recursive = true;
				} else targets.push(arg);
			}
			if (
				recursive &&
				targets.some((target) => protectedRemoval(target, directory, root))
			)
				return {
					deny: "Recursive deletion of the repository root or .git is blocked; target a specific generated directory.",
				};
			if (targets.some((target) => /[*?~]/.test(target))) return uncertain;
		}
		if (
			[
				"sh",
				"bash",
				"zsh",
				"eval",
				"env",
				"find",
				"xargs",
				"for",
				"while",
				"if",
				"case",
			].includes(executable)
		)
			return uncertain;
	}
	return ambiguous ? uncertain : {};
}
