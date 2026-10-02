import { useEffect } from "react";
import {
	I18nProvider,
	type LocaleLoader,
	useI18n,
	useLocaleLoader,
} from "./I18nProvider";
import { createPayload, type I18nConfig, type I18nPayload } from "./i18n";
export const exampleConfig: I18nConfig = {
	defaultLocale: "en",
	fallbackLocale: "en",
	timeZone: "UTC",
	locales: {
		en: {
			direction: "ltr",
			messages: {
				heading: "Internationalization",
				hello: "Hello {{name}}",
				items_one: "{{count}} item",
				items_other: "{{count}} items",
				fallback: "Fallback message",
				literal: "<img src=x onerror=alert(1)>",
				missingValue: "Hello {{name}}",
			},
		},
		de: {
			direction: "ltr",
			messages: {
				heading: "Internationalisierung",
				hello: "Hallo {{name}}",
				items_one: "{{count}} Eintrag",
				items_other: "{{count}} Einträge",
				missingValue: "Hallo {{missing}}",
			},
		},
		ar: {
			direction: "rtl",
			messages: {
				heading: "تدويل",
				hello: "مرحبًا {{name}}",
				items_zero: "لا عناصر",
				items_one: "عنصر واحد",
				items_two: "عنصران",
				items_few: "{{count}} عناصر",
				items_many: "{{count}} عنصرًا",
				items_other: "{{count}} عنصر",
			},
		},
	},
};
export const createExamplePayload = (locale: unknown) =>
	createPayload(exampleConfig, locale, [
		{
			id: "date",
			kind: "date",
			value: Date.UTC(2026, 0, 15, 12),
			preset: "dateTime",
		},
		{ id: "currency", kind: "number", value: 1234.5, preset: "currency" },
	]);
export const exampleLoader: LocaleLoader = async (locale, signal) => {
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => {
				signal.removeEventListener("abort", abort);
				resolve();
			},
			locale === "de" ? 180 : 20,
		);
		const abort = () => {
			clearTimeout(timer);
			reject(new Error("Cancelled"));
		};
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	});
	return createExamplePayload(locale);
};
function Content() {
	const i18n = useI18n();
	return (
		<section
			lang={i18n.payload.locale}
			dir={i18n.payload.locales[i18n.payload.locale].direction}
			aria-label="Localized example"
		>
			<h2>{i18n.text("heading")}</h2>
			<p data-testid="greeting">{i18n.text("hello", { name: "Ada" })}</p>
			<p data-testid="currency">{i18n.payload.formatted.currency}</p>
			<p data-testid="date">{i18n.payload.formatted.date}</p>
			<p data-testid="fallback">{i18n.text("fallback")}</p>
			<p data-testid="literal">{i18n.text("literal")}</p>
			<ul>
				{[0, 1, 2, 3, 11, 100].map((count) => (
					<li key={count} data-testid={`plural-${count}`}>
						{i18n.text("items", {}, count)}
					</li>
				))}
			</ul>
		</section>
	);
}
/** Query/history is explicitly owned by this demo, never the provider. */
export function I18nExample({
	initial,
	load = exampleLoader,
}: {
	initial: I18nPayload;
	load?: LocaleLoader;
}) {
	const { payload, status, change, cancel } = useLocaleLoader(initial, load);
	useEffect(() => {
		const pop = () => {
			void change(
				new URL(window.location.href).searchParams.get("locale") ??
					initial.defaultLocale,
			);
		};
		window.addEventListener("popstate", pop);
		return () => window.removeEventListener("popstate", pop);
	}, [change, initial.defaultLocale]);
	const select = async (locale: string) => {
		if (!(await change(locale))) return;
		const url = new URL(window.location.href);
		url.searchParams.set("locale", locale);
		window.history.pushState(null, "", url);
	};
	return (
		<div>
			<nav aria-label="Example language">
				{["en", "de", "ar"].map((locale) => (
					<button type="button" key={locale} onClick={() => select(locale)}>
						{locale}
					</button>
				))}
			</nav>
			<button type="button" onClick={cancel}>
				Cancel locale change
			</button>
			<output>{status}</output>
			<I18nProvider key={payload.locale} payload={payload}>
				<Content />
			</I18nProvider>
		</div>
	);
}
