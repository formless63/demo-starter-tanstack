import { createFileRoute } from "@tanstack/react-router";
import { FileUI } from "../components/file-ui";
import { createFileClient } from "../integrations/file-ui/client";

const client = createFileClient();
export const Route = createFileRoute("/app/files")({ component: FilesPage });
function FilesPage() {
	return (
		<main className="p-6">
			<h1 className="text-2xl font-semibold">Files</h1>
			<p>
				Private files, newest 100 receipts. Downloads are attachments; pending
				cleanup may need an operator.
			</p>
			<FileUI client={client} />
		</main>
	);
}
