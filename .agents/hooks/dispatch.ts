import { readFileSync } from "node:fs";
import {
	object,
	repositoryRoot,
	response,
	text,
	type Provider,
} from "./common.ts";
import { sessionContext } from "./session-context.ts";
import { guard } from "./tool-guard.ts";
import { qualityGate } from "./quality-gate.ts";

const phase = process.argv[2];
const provider = process.argv[3];
if (!["claude", "codex", "gemini"].includes(provider))
	throw new Error("Unsupported hook provider");
let payload = {};
try {
	payload = object(JSON.parse(readFileSync(0, "utf8")));
} catch {
	/* Untrusted malformed input: guard fails open below. */
}
const client = provider as Provider;
let output;
if (phase === "session")
	output = response(
		client,
		"session",
		sessionContext(repositoryRoot),
		undefined,
		text(object(payload).hook_event_name),
	);
else if (phase === "guard") {
	const result = guard(object(payload), repositoryRoot);
	output = response(client, "guard", result.deny, result.warning);
} else if (phase === "quality")
	output = response(client, "quality", qualityGate(repositoryRoot));
else throw new Error("Unsupported hook phase");
console.log(JSON.stringify(output));
