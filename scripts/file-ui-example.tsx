import { useState } from "react";
import { FileUI, type FileUIClient, type FileView } from "../src/components/file-ui";

type UploadMode = "ready" | "fail" | "committed-error" | "pending" | "wait" | "cancel-race";
type Metrics = { uploads: number; removals: number; retryMismatches: number };
const initialMetrics: Metrics = { uploads: 0, removals: 0, retryMismatches: 0 };
const hostileName = '<img src=x onerror="window.previewExecuted=true">.html';

/** Bounded UI-only fixture. Storage, authentication and ownership have separate integration tests. */
function createFixture(report: (metrics: Metrics) => void, alternate = false) {
	const seed: FileView[] = alternate ? [
		{ id: "other", name: "other-scope.txt", type: "text/plain", size: 5, state: "ready" },
	] : [
		{ id: "report", name: "report.pdf", type: "application/pdf", size: 128, state: "ready" },
		{ id: "html", name: hostileName, type: "text/html", size: 64, state: "ready" },
		{ id: "pending", name: "pending.txt", type: "text/plain", size: 3, state: "uploading" },
		{ id: "cleanup", name: "cleanup.txt", type: "text/plain", size: 3, state: "cleanup-pending" },
		{ id: "removed", name: "removed.txt", type: "text/plain", size: 3, state: "removed" },
	];
	const files = new Map(seed.map((file) => [file.id, file]));
	const attempts = new Map<string, { file: File; bytes: Uint8Array; id: string }>();
	const keysByFile = new WeakMap<File, string>();
	const metrics = { ...initialMetrics };
	let mode: UploadMode = "ready";
	let failList = false;
	let failRemove = false;
	let delayList = false;
	let finishList: (() => void) | undefined;
	let finishUpload: (() => void) | undefined;
	const client: FileUIClient = {
		async list() {
			if (failList) { failList = false; throw new Error("private-provider-message"); }
			const snapshot = [...files.values()].map((file) => ({ ...file }));
			if (delayList) {
				delayList = false;
				// Deliberately ignores cancellation to exercise stale-result protection.
				await new Promise<void>((resolve) => { finishList = resolve; });
			}
			return snapshot;
		},
		async upload(file, key, signal) {
			metrics.uploads += 1;
			report({ ...metrics });
			const bytes = new Uint8Array(await file.arrayBuffer());
			const prior = attempts.get(key);
			const priorKey = keysByFile.get(file);
			if (priorKey && priorKey !== key) metrics.retryMismatches += 1;
			keysByFile.set(file, key);
			if (prior && (prior.file !== file || prior.bytes.length !== bytes.length || prior.bytes.some((byte, index) => byte !== bytes[index]))) metrics.retryMismatches += 1;
			const id = prior?.id ?? `upload-${attempts.size + 1}`;
			attempts.set(key, { file, bytes, id });
			report({ ...metrics });
			const existing = files.get(id);
			if (existing?.state === "ready") return existing;
			const record: FileView = { id, name: file.name, type: file.type, size: file.size, state: "uploading" };
			files.set(id, record);
			const selectedMode = mode;
			mode = "ready";
			if (selectedMode === "fail") throw new Error("private-provider-message");
			if (selectedMode === "pending") return record;
			if (selectedMode === "wait" || selectedMode === "cancel-race") {
				await new Promise<void>((resolve, reject) => {
					const abort = () => { finishUpload = undefined; reject(new DOMException("Cancelled", "AbortError")); };
					finishUpload = () => { signal.removeEventListener("abort", abort); finishUpload = undefined; resolve(); };
					if (selectedMode === "wait") {
						if (signal.aborted) abort();
						else signal.addEventListener("abort", abort, { once: true });
					}
				});
			}
			const ready: FileView = { ...record, state: "ready" };
			files.set(id, ready);
			if (selectedMode === "committed-error") throw new Error("response-lost-after-commit");
			return ready;
		},
		async remove(id) {
			metrics.removals += 1;
			report({ ...metrics });
			if (failRemove) { failRemove = false; throw new Error("private-provider-message"); }
			const file = files.get(id);
			if (!file) throw new Error("Missing fixture file");
			const result: FileView = { ...file, state: file.state === "cleanup-pending" ? "removed" : "cleanup-pending" };
			files.set(id, result);
			return result;
		},
		downloadUrl: (id) => `/fixture-download/${encodeURIComponent(id)}`,
	};
	return {
		client,
		setMode: (value: UploadMode) => { mode = value; },
		failList: () => { failList = true; },
		failRemove: () => { failRemove = true; },
		delayList: () => { delayList = true; },
		finishList: () => { finishList?.(); finishList = undefined; },
		finishUpload: () => finishUpload?.(),
	};
}

export function Example() {
	const [metrics, setMetrics] = useState(initialMetrics);
	const [fixture] = useState(() => createFixture(setMetrics));
	const [alternate] = useState(() => createFixture(setMetrics, true));
	const [other, setOther] = useState(false);
	const [mounted, setMounted] = useState(true);
	const current = other ? alternate : fixture;
	return <main>
		<h1>File UI browser fixture</h1>
		<fieldset>
			<legend>Fixture controls</legend>
			<label htmlFor="fixture-upload-mode">Next upload</label><select id="fixture-upload-mode" defaultValue="ready" onChange={(event) => current.setMode(event.target.value as UploadMode)}>
				<option value="ready">Complete</option><option value="fail">Fail before confirmation</option><option value="committed-error">Lose response after commit</option><option value="pending">Return pending</option><option value="wait">Wait until cancelled</option><option value="cancel-race">Ignore cancellation until resolved</option>
			</select>
			<button type="button" onClick={current.finishUpload}>Finish pending upload</button>
			<button type="button" onClick={current.failList}>Fail next refresh</button>
			<button type="button" onClick={current.failRemove}>Fail next removal</button>
			<button type="button" onClick={current.delayList}>Delay next refresh</button>
			<button type="button" onClick={current.finishList}>Finish delayed refresh</button>
			<button type="button" onClick={fixture.finishUpload}>Finish original scope upload</button>
			<button type="button" onClick={() => setOther((value) => !value)}>Switch client scope</button>
			<button type="button" onClick={() => setMounted((value) => !value)}>Toggle file UI</button>
			<output aria-label="Upload calls">{metrics.uploads}</output>
			<output aria-label="Removal calls">{metrics.removals}</output>
			<output aria-label="Retry mismatches">{metrics.retryMismatches}</output>
		</fieldset>
		{mounted && <FileUI client={current.client} maxBytes={1024} />}
	</main>;
}
