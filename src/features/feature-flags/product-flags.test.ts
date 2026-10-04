import { describe, expect, it, vi } from "vitest";
import {
	isBetaDashboardEnabled,
	loadProductFlags,
	type ProductFlags,
} from "./product-flags";

const disabled = { "beta.dashboard": false };
const enabled = { "beta.dashboard": true };
const jsonFetch = (body: unknown) =>
	vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));

describe("fixed browser flag projection", () => {
	it("uses only the fixed same-origin private endpoint and literal boolean", async () => {
		const controller = new AbortController();
		const fetcher = jsonFetch({ ...enabled, "private.flag": true });
		expect(await loadProductFlags(controller.signal, fetcher)).toEqual(enabled);
		expect(fetcher).toHaveBeenCalledWith("/api/flags", {
			signal: controller.signal,
			cache: "no-store",
			credentials: "same-origin",
		});
	});

	it.each([
		null,
		[],
		"true",
		1,
		{},
		{ "beta.dashboard": "true" },
	])("returns false for malformed projection %j", async (body) => {
		expect(
			await loadProductFlags(new AbortController().signal, jsonFetch(body)),
		).toEqual(disabled);
	});

	it.each([
		"transport",
		"invalid-json",
		"http-error",
	])("replaces a prior true projection after %s failure", async (failure) => {
		const fetcher = vi.fn<typeof fetch>();
		fetcher.mockResolvedValueOnce(new Response(JSON.stringify(enabled)));
		if (failure === "transport")
			fetcher.mockRejectedValueOnce(new TypeError("Synthetic rejection"));
		else
			fetcher.mockResolvedValueOnce(
				new Response(failure === "invalid-json" ? "{" : "", {
					status: failure === "http-error" ? 503 : 200,
				}),
			);
		let data: ProductFlags = await loadProductFlags(
			new AbortController().signal,
			fetcher,
		);
		expect(
			isBetaDashboardEnabled({ data, isError: false, fetchStatus: "idle" }),
		).toBe(true);
		data = await loadProductFlags(new AbortController().signal, fetcher);
		expect(data).toEqual(disabled);
		expect(
			isBetaDashboardEnabled({ data, isError: false, fetchStatus: "idle" }),
		).toBe(false);
	});

	it("refuses cached true on an error result", () => {
		expect(
			isBetaDashboardEnabled({
				data: enabled,
				isError: true,
				fetchStatus: "idle",
			}),
		).toBe(false);
		expect(
			isBetaDashboardEnabled({ isError: false, fetchStatus: "idle" }),
		).toBe(false);
	});

	it("refuses cached true while refetch is paused", () => {
		expect(
			isBetaDashboardEnabled({
				data: enabled,
				isError: false,
				fetchStatus: "paused",
			}),
		).toBe(false);
	});

	it("does not fetch for an already cancelled identity", async () => {
		const controller = new AbortController();
		controller.abort();
		const fetcher = jsonFetch(enabled);
		await expect(loadProductFlags(controller.signal, fetcher)).rejects.toBe(
			controller.signal.reason,
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("discards a late old-identity response even if transport ignores cancellation", async () => {
		const oldIdentity = new AbortController();
		let resolve!: (response: Response) => void;
		const fetcher = vi.fn<typeof fetch>().mockImplementation(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		);
		const pending = loadProductFlags(oldIdentity.signal, fetcher);
		oldIdentity.abort();
		resolve(new Response(JSON.stringify(enabled)));
		await expect(pending).rejects.toBe(oldIdentity.signal.reason);
		expect(
			await loadProductFlags(new AbortController().signal, jsonFetch(disabled)),
		).toEqual(disabled);
	});

	it("discards cancellation during JSON decoding", async () => {
		const controller = new AbortController();
		const response = new Response();
		const reason = new DOMException("Identity changed", "AbortError");
		vi.spyOn(response, "json").mockImplementation(async () => {
			controller.abort(reason);
			return enabled;
		});
		await expect(
			loadProductFlags(
				controller.signal,
				vi.fn<typeof fetch>().mockResolvedValue(response),
			),
		).rejects.toBe(reason);
	});

	it("preserves an abort rejection from transport", async () => {
		const abort = new DOMException("Cancelled", "AbortError");
		await expect(
			loadProductFlags(
				new AbortController().signal,
				vi.fn<typeof fetch>().mockRejectedValue(abort),
			),
		).rejects.toBe(abort);
	});
});
