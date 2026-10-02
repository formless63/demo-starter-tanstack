import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/integrations/medusa/$")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const { medusaHttp } = await import(
					"../../../../lib/medusa-http.server"
				);
				return medusaHttp(request, params._splat ?? "");
			},
			POST: async ({ request, params }) => {
				const { medusaHttp } = await import(
					"../../../../lib/medusa-http.server"
				);
				return medusaHttp(request, params._splat ?? "");
			},
		},
	},
});
