import { checkProject, projectStatus } from "./lib/project.ts";
const root = process.cwd();
try {
	const command = process.argv[2];
	if (command === "check") {
		const errors = checkProject(root);
		if (errors.length) throw new Error(errors.join("\n"));
		console.log(projectStatus(root));
		console.log("Project schemas, templates, and metadata are valid.");
	} else if (command === "status")
		console.log(projectStatus(root, process.argv.includes("--session")));
	else throw new Error("Use project:check or project:status.");
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Project validation failed.",
	);
	process.exitCode = 1;
}
