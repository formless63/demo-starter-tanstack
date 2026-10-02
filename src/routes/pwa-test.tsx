import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { pwaConfig } from "../integrations/pwa-offline/config";
import { PwaPanel } from "../integrations/pwa-offline/PwaPanel";
export const Route = createFileRoute("/pwa-test")({
	head: () => ({
		links: import.meta.env.PROD
			? [{ rel: "manifest", href: `${pwaConfig.base}manifest.webmanifest` }]
			: [],
	}),
	component: Page,
});
function Page() {
	const [draft, setDraft] = useState("");
	return (
		<main>
			<h1>PWA / Offline</h1>
			<PwaPanel />
			<label>
				Unsaved local draft
				<textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
				/>
			</label>
			<p>This test form is not persisted. Updates never reload it.</p>
		</main>
	);
}
