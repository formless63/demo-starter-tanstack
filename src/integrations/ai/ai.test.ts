import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createAi } from "./ai.server";
import { resolveAiConfig, validateAiConfig } from "./config.server";
import { AiError, aiError } from "./errors.server";
import { finishReason, usage, validateAiInput } from "./validation.server";

const input = { messages: [{ role: "user" as const, content: "hello" }] };
describe("AI v1 backendless contract", () => {
	it("is lazy and has canonical configuration defaults", async () => {
		createAi();
		expect(resolveAiConfig({ AI_MODEL: "explicit-model" })).toEqual({
			provider: "openai-compatible",
			model: "explicit-model",
			timeoutSeconds: 60,
		});
		await expect(
			createAi({
				provider: "openai-compatible",
				model: "",
				timeoutSeconds: 60,
			}).generateText(input),
		).rejects.toMatchObject({ code: "configuration" });
		for (const env of [
			{},
			{ AI_MODEL: "x", AI_PROVIDER: "other" },
			{ AI_MODEL: "x", AI_TIMEOUT_SECONDS: "0" },
			{ AI_MODEL: "x", AI_TIMEOUT_SECONDS: "301" },
			{ AI_MODEL: "x", AI_TIMEOUT_SECONDS: "1.5" },
			{ AI_MODEL: "x", AI_TIMEOUT_SECONDS: "" },
			{ AI_MODEL: "x".repeat(129) },
			{ AI_MODEL: "x\n" },
			{ AI_MODEL: "x", AI_BASE_URL: "http://example.com/v1" },
			{
				AI_MODEL: "x",
				AI_BASE_URL: "http://localhost/v1",
				NODE_ENV: "production",
			},
			{ AI_MODEL: "x", AI_BASE_URL: "https://user:secret@example.com" },
			{ AI_MODEL: "x", AI_BASE_URL: "https://example.com?key=secret" },
		])
			expect(() => resolveAiConfig(env)).toThrow(AiError);
		for (const timeoutSeconds of [1, 300])
			expect(
				validateAiConfig({
					provider: "openai-compatible",
					model: "x",
					timeoutSeconds,
				}).timeoutSeconds,
			).toBe(timeoutSeconds);
		expect(
			resolveAiConfig({
				AI_MODEL: "x",
				AI_BASE_URL: "http://localhost/v1",
				NODE_ENV: "development",
			}).baseUrl,
		).toBe("http://localhost/v1");
	});
	it("bounds UTF-8 inputs, rejects malformed/control/extra input and snapshots", () => {
		for (const messages of [
			[],
			Array.from({ length: 101 }, () => input.messages[0]),
			[{ role: "tool", content: "x" }],
			[{ role: "user", content: "" }],
			[{ role: "user", content: "\u0000" }],
			[{ role: "user", content: "\ud800" }],
			[{ role: "user", content: "é".repeat(32769) }],
			Array.from({ length: 5 }, () => ({
				role: "user",
				content: "x".repeat(65536),
			})),
			[{ role: "user", content: "x", extra: "x" }],
		])
			expect(() => validateAiInput({ messages } as typeof input)).toThrow(
				AiError,
			);
		for (const controls of [
			{ temperature: NaN },
			{ temperature: -1 },
			{ temperature: 2.1 },
			{ maxOutputTokens: 0 },
			{ maxOutputTokens: 65537 },
			{ maxOutputTokens: 1.5 },
			{ tools: [] },
		])
			expect(() => validateAiInput({ ...input, ...controls })).toThrow(AiError);
		expect(
			validateAiInput({
				messages: Array.from({ length: 4 }, () => ({
					role: "user",
					content: "é".repeat(32768),
				})),
				temperature: 2,
				maxOutputTokens: 65536,
			}),
		).toBeDefined();
		expect(
			validateAiInput({ ...input, temperature: 0, maxOutputTokens: 1 })
				.messages,
		).not.toBe(input.messages);
	});
	it("normalizes finite usage and safe errors without any provider cause", () => {
		expect(
			usage({
				prompt_tokens: -1,
				completion_tokens: Infinity,
				total_tokens: 1.5,
			}),
		).toBeUndefined();
		expect(usage({ prompt_tokens: 0 })).toEqual({ inputTokens: 0 });
		expect(
			["stop", "length", "content_filter", "tool_calls"].map(finishReason),
		).toEqual(["stop", "length", "content-filter", "other"]);
		for (const error of [
			{ status: 401, body: "secret" },
			{ status: 429, message: "prompt" },
			new Error("private-output"),
		]) {
			const safe = aiError(error);
			expect(safe.cause).toBeUndefined();
			expect(JSON.stringify(safe) + inspect(safe)).not.toMatch(
				/secret|prompt|private-output/,
			);
		}
	});
});

it("exercises the real SDK against local HTTP including stalled sockets", async () => {
	const { runAiFixture } = await import("../../../scripts/ai-fixture");
	await runAiFixture();
}, 15000);
