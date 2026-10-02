import { createFileRoute } from "@tanstack/react-router";
import { getI18nReference } from "../features/i18n-reference";
import { I18nExample } from "../integrations/internationalization/example";
export const Route = createFileRoute("/i18n-test")({
	validateSearch: (search: Record<string, unknown>) => ({
		locale:
			typeof search.locale === "string" &&
			["en", "de", "ar"].includes(search.locale)
				? search.locale
				: "en",
	}),
	loaderDeps: ({ search }) => ({ locale: search.locale }),
	loader: ({ deps }) => getI18nReference({ data: deps }),
	component: Page,
});
function Page() {
	const payload = Route.useLoaderData();
	return (
		<main>
			<h1>Internationalization demo</h1>
			<I18nExample key={payload.locale} initial={payload} />
		</main>
	);
}
