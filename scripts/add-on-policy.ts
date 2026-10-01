import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

interface Installable { id: string; requires: string[]; tanstackAddOn: { sourceDirectory: string; dependsOn: string[] } }
export function installationCollisions(root: string, capabilities: Installable[]) {
	const owners = new Map<string, string[]>();
	for (const capability of capabilities) {
		const assets = resolve(root, capability.tanstackAddOn.sourceDirectory, "assets");
		function walk(directory: string) {
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				const path = resolve(directory, entry.name);
				if (entry.isDirectory()) walk(path);
				else { const key = relative(assets, path); owners.set(key, [...(owners.get(key) ?? []), capability.id]); }
			}
		}
		walk(assets);
	}
	return [...owners].filter(([, ids]) => ids.length > 1).flatMap(([path, ids]) => {
		const last = capabilities.find(c => c.id === ids.at(-1));
		const reviewPath = resolve(root, `capabilities/${last?.id}/installation.json`);
		const reviews = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, "utf8")).reviewedOverrides : [];
		const accepted = ids.slice(0, -1).every(id => last?.requires.includes(id) && reviews.some((review: {path: string; dependency: string}) => review.path === path && review.dependency === id));
		return accepted ? [] : [{ path, owners: ids }];
	});
}
