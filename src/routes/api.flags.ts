import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/flags")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				(await import("#/features/feature-flags/flags.server")).flagProjection(
					request,
				),
		},
	},
});
