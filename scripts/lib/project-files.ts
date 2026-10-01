import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { relativePath } from "./project-contracts.ts";

export function readJson(root: string, path: string): unknown {
	const file = resolve(root, path);
	if (!repositoryFile(root, path))
		throw new Error("JSON reference must be a repository file.");
	try {
		if (statSync(file).size > 512 * 1024) throw new Error();
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		throw new Error("Cannot read bounded project JSON.");
	}
}
export function repositoryFile(root: string, path: string): boolean {
	if (
		!relativePath.safeParse(path).success ||
		/(?:^|\/)\.env(?:$|\.)(?!example$|sample$)/.test(path)
	)
		return false;
	try {
		const actual = realpathSync(resolve(root, path));
		return (
			actual.startsWith(realpathSync(root) + sep) && statSync(actual).isFile()
		);
	} catch {
		return false;
	}
}
