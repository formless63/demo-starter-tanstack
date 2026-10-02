import { useCallback, useEffect, useRef, useState } from "react";
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
	onLocaleCommitted,
}: {
	initial: I18nPayload;
	load?: LocaleLoader;
	onLocaleCommitted?: (locale: string) => void | Promise<void>;
}) {
	const [interactive, setInteractive] = useState(false);
	const [navigating, setNavigating] = useState(false);
	const navigationGeneration = useRef(0);
	const acceptedUrl = useRef<string | null>(null);
	const pendingUrl = useRef<string | null>(null);
	useEffect(() => {
		acceptedUrl.current = window.location.href;
		setInteractive(true);
		return () => {
			navigationGeneration.current++;
		};
	}, []);
	const { payload, status, change, cancel } = useLocaleLoader(initial, load);
	const restoreUrl = useCallback(
		(expected: string | null) => {
			if (
				!onLocaleCommitted &&
				expected &&
				acceptedUrl.current &&
				window.location.href === expected
			) {
				window.history.replaceState(
					window.history.state,
					"",
					acceptedUrl.current,
				);
			}
		},
		[onLocaleCommitted],
	);
	useEffect(() => {
		if (onLocaleCommitted) return;
		const pop = async () => {
			const id = ++navigationGeneration.current;
			const url = window.location.href;
			pendingUrl.current = url;
			const success = await change(
				new URL(url).searchParams.get("locale") ?? initial.defaultLocale,
			);
			if (navigationGeneration.current !== id) return;
			if (success) acceptedUrl.current = url;
			else restoreUrl(url);
			pendingUrl.current = null;
		};
		window.addEventListener("popstate", pop);
		return () => window.removeEventListener("popstate", pop);
	}, [change, initial.defaultLocale, onLocaleCommitted, restoreUrl]);
	const cancelChange = () => {
		navigationGeneration.current++;
		cancel();
		restoreUrl(pendingUrl.current);
		pendingUrl.current = null;
	};
	const select = async (locale: string) => {
		const id = ++navigationGeneration.current;
		const priorUrl = window.location.href;
		pendingUrl.current = priorUrl;
		const success = await change(locale);
		if (navigationGeneration.current !== id) return;
		if (!success) {
			restoreUrl(priorUrl);
			pendingUrl.current = null;
			return;
		}
		pendingUrl.current = null;
		if (onLocaleCommitted) {
			setNavigating(true);
			try {
				await onLocaleCommitted(locale);
			} finally {
				if (navigationGeneration.current === id) setNavigating(false);
			}
			return;
		}
		const url = new URL(window.location.href);
		url.searchParams.set("locale", locale);
		window.history.pushState(null, "", url);
		acceptedUrl.current = url.href;
	};
	// A router-hosted page only renders the router’s committed canonical payload.
	// Preloaded local state must not outlive a cancelled native navigation.
	const displayedPayload = onLocaleCommitted ? initial : payload;
	return (
		<div>
			<nav aria-label="Example language">
				{["en", "de", "ar"].map((locale) => (
					<button
						disabled={!interactive || navigating}
						type="button"
						key={locale}
						onClick={() => select(locale)}
					>
						{locale}
					</button>
				))}
			</nav>
			<button
				disabled={!interactive || navigating}
				type="button"
				onClick={cancelChange}
			>
				Cancel locale change
			</button>
			<output>{status}</output>
			<I18nProvider key={displayedPayload.locale} payload={displayedPayload}>
				<Content />
			</I18nProvider>
		</div>
	);
}
