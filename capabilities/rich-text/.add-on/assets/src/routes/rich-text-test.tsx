import { createFileRoute } from "@tanstack/react-router";
import { RichTextExample } from "../integrations/rich-text/Example";
export const Route = createFileRoute("/rich-text-test")({
	component: RichTextExample,
});
