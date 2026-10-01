import { expect, it } from "vitest";
import { createApplicationAi } from "./ai.server";

it("keeps application instrumentation optional and lazy", async () => {
	const ai = createApplicationAi(
		{ provider: "openai-compatible", model: "", timeoutSeconds: 60 },
		() => {
			throw new Error("telemetry failure");
		},
	);
	await expect(
		ai.generateText({ messages: [{ role: "user", content: "x" }] }),
	).rejects.toMatchObject({ code: "configuration" });
});

it("preserves real HTTP operations when application telemetry throws", async () => {
	const { runAiFixture } = await import("../../scripts/ai-fixture");
	const signals: unknown[] = [];
	await runAiFixture((config) =>
		createApplicationAi(config, (signal) => {
			signals.push(signal);
			throw new Error("telemetry failure");
		}),
	);
	expect(signals.length).toBeGreaterThan(0);
	expect(JSON.stringify(signals)).not.toMatch(
		/fixture-model|fixture-api-key|hello|answer|messages|baseUrl/,
	);
}, 15000);
