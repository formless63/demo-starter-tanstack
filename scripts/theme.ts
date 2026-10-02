import { applyTheme, checkTheme, importTheme } from "./lib/theme.ts";
const root = process.cwd();
const args = process.argv.slice(2).filter((arg) => arg !== "--");
try {
	const [command, source, ...options] = args;
	if (command === "check") {
		const errors = checkTheme(root);
		if (errors.length) throw new Error(errors.join("\n"));
		console.log("Semantic theme and generated appearance are valid.");
	} else if (command === "apply") {
		applyTheme(root);
		console.log("Applied reviewed semantic CSS and color-mode policy.");
	} else if (command === "import" && source) {
		const kind = options[0] === "--kind" ? options[1] : undefined;
		if (
			options.length &&
			(options.length !== 2 ||
				!["tweakcn", "shadcn-registry"].includes(kind ?? ""))
		)
			throw new Error("Optional kind must be tweakcn or shadcn-registry.");
		const theme = await importTheme(
			root,
			source,
			kind as "tweakcn" | "shadcn-registry" | undefined,
		);
		console.log(
			`Imported ${theme.name} (${theme.source.type}) into .project/theme.json. Review profile provenance/fonts/accessibility, then run theme:apply.`,
		);
	} else
		throw new Error(
			"Use theme:check, theme:apply, or theme:import -- <source> [--kind tweakcn].",
		);
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Theme operation failed.",
	);
	process.exitCode = 1;
}
