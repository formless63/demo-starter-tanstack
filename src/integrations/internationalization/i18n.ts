import { createInstance, type i18n } from "i18next";

export type Direction = "ltr" | "rtl";
export type Messages = { [key: string]: string | Messages };
export interface LocaleDefinition {
	direction: Direction;
	messages: Messages;
}
export interface I18nConfig {
	locales: Record<string, LocaleDefinition>;
	defaultLocale: string;
	fallbackLocale: string;
	timeZone: string;
}
export interface I18nPayload extends I18nConfig {
	locale: string;
	formatted: Record<string, string>;
}
export type Diagnostic = "missing-message" | "missing-value";
export type Values = Record<string, string | number>;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const keyPart = /^[A-Za-z][A-Za-z0-9_-]*$/;
const token = /{{([A-Za-z][A-Za-z0-9_]*)}}/g;
const encoder = new TextEncoder();
function invalid(): never {
	throw new Error("Invalid internationalization configuration");
}
function plain(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
function entries(value: unknown): [string, unknown][] {
	if (!plain(value) || Object.getOwnPropertySymbols(value).length)
		return invalid();
	return Object.getOwnPropertyNames(value).map((key) => {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (
			forbidden.has(key) ||
			!descriptor ||
			!("value" in descriptor) ||
			!descriptor.enumerable
		)
			return invalid();
		return [key, descriptor.value];
	});
}
export function validateConfig(input: I18nConfig): I18nConfig {
	const config = Object.fromEntries(entries(input));
	if (
		Object.keys(config).some(
			(k) =>
				![
					"locales",
					"defaultLocale",
					"fallbackLocale",
					"timeZone",
					"locale",
					"formatted",
				].includes(k),
		)
	)
		invalid();
	const localeEntries = entries(config.locales);
	if (!localeEntries.length || localeEntries.length > 32) invalid();
	let bytes = 0;
	let keys = 0;
	const visit = (value: unknown, depth: number): Messages => {
		if (depth > 8) return invalid();
		const result: Messages = Object.create(null);
		for (const [key, item] of entries(value)) {
			if (!keyPart.test(key) || ++keys > 10_000) invalid();
			bytes += encoder.encode(key).length;
			if (typeof item === "string") {
				bytes += encoder.encode(item).length;
				if (
					encoder.encode(item).length > 8192 ||
					item.includes("$t(") ||
					/[{}]/.test(item.replace(token, ""))
				)
					invalid();
				result[key] = item;
			} else result[key] = visit(item, depth + 1);
			if (bytes > 1_048_576) invalid();
		}
		return result;
	};
	const locales: Record<string, LocaleDefinition> = Object.create(null);
	for (const [locale, definition] of localeEntries) {
		try {
			if (Intl.getCanonicalLocales(locale)[0] !== locale) invalid();
		} catch {
			invalid();
		}
		if (
			!Intl.PluralRules.supportedLocalesOf([locale]).length ||
			!Intl.DateTimeFormat.supportedLocalesOf([locale]).length
		)
			invalid();
		const def = Object.fromEntries(entries(definition));
		if (
			Object.keys(def).sort().join(",") !== "direction,messages" ||
			typeof def.direction !== "string" ||
			!["ltr", "rtl"].includes(def.direction)
		)
			invalid();
		locales[locale] = {
			direction: def.direction as Direction,
			messages: visit(def.messages, 1),
		};
	}
	if (encoder.encode(JSON.stringify(locales)).length > 1_048_576) invalid();
	if (
		typeof config.defaultLocale !== "string" ||
		!Object.hasOwn(locales, config.defaultLocale) ||
		typeof config.fallbackLocale !== "string" ||
		!Object.hasOwn(locales, config.fallbackLocale) ||
		typeof config.timeZone !== "string"
	)
		invalid();
	try {
		new Intl.DateTimeFormat("en", { timeZone: config.timeZone });
	} catch {
		invalid();
	}
	return {
		locales,
		defaultLocale: config.defaultLocale as string,
		fallbackLocale: config.fallbackLocale as string,
		timeZone: config.timeZone as string,
	};
}
export function resolveLocale(config: I18nConfig, requested: unknown): string {
	return typeof requested === "string" &&
		Object.hasOwn(config.locales, requested)
		? requested
		: config.defaultLocale;
}
function lookup(messages: Messages, key: string): string | undefined {
	let value: string | Messages = messages;
	for (const part of key.split(".")) {
		if (
			!keyPart.test(part) ||
			forbidden.has(part) ||
			typeof value === "string" ||
			!Object.hasOwn(value, part)
		)
			return;
		value = value[part];
	}
	return typeof value === "string" ? value : undefined;
}
export interface I18nRuntime {
	instance: i18n;
	payload: I18nPayload;
	text: (key: string, values?: Values, count?: number) => string;
	number: (value: number, preset: "decimal" | "currency") => string;
	date: (value: number, preset: "date" | "dateTime") => string;
}
function initialize(
	input: I18nPayload,
	diagnostic?: (code: Diagnostic) => void,
) {
	const config = validateConfig(input);
	if (resolveLocale(config, input.locale) !== input.locale) invalid();
	const formatted: Record<string, string> = Object.create(null);
	for (const [key, value] of entries(input.formatted)) {
		if (
			!keyPart.test(key) ||
			typeof value !== "string" ||
			encoder.encode(value).length > 8192 ||
			Object.keys(formatted).length >= 100
		)
			invalid();
		formatted[key] = value;
	}
	const payload: I18nPayload = { ...config, locale: input.locale, formatted };
	const instance = createInstance();
	const ready = instance.init({
		lng: payload.locale,
		fallbackLng: payload.fallbackLocale,
		supportedLngs: Object.keys(config.locales),
		load: "currentOnly",
		resources: Object.fromEntries(
			Object.entries(config.locales).map(([locale, def]) => [
				locale,
				{ translation: def.messages },
			]),
		),
		initAsync: false,
		saveMissing: false,
		returnNull: false,
		returnEmptyString: true,
		returnObjects: false,
		nsSeparator: false,
		interpolation: {
			escapeValue: false,
			skipOnVariables: true,
			maxReplaces: 2048,
		},
		react: { useSuspense: false },
	});
	const emit = (code: Diagnostic) => {
		try {
			diagnostic?.(code);
		} catch {
			/* Diagnostics never change rendering. */
		}
	};
	const runtime: I18nRuntime = {
		instance,
		payload,
		text(key, values = {}, count) {
			if (
				typeof key !== "string" ||
				key.length > 256 ||
				!key
					.split(".")
					.every((part) => keyPart.test(part) && !forbidden.has(part))
			)
				return "invalid-message";
			const safe: Values = Object.create(null);
			for (const [name, value] of entries(values)) {
				if (
					!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) ||
					(typeof value !== "string" && typeof value !== "number") ||
					(typeof value === "number" && !Number.isFinite(value)) ||
					String(value).length > 8192
				)
					invalid();
				safe[name] = value as string | number;
			}
			if (count !== undefined) {
				if (!Number.isFinite(count)) invalid();
				safe.count = count;
			}
			for (const locale of [
				...new Set([payload.locale, payload.fallbackLocale]),
			]) {
				const suffix =
					count === undefined
						? ""
						: `_${new Intl.PluralRules(locale).select(count)}`;
				const messageKey =
					suffix &&
					lookup(config.locales[locale].messages, key + suffix) !== undefined
						? key + suffix
						: key;
				const message = lookup(config.locales[locale].messages, messageKey);
				if (message === undefined) continue;
				if (
					[...message.matchAll(token)].some(
						(match) => !Object.hasOwn(safe, match[1]),
					)
				) {
					emit("missing-value");
					continue;
				}
				return instance.t(messageKey, {
					lng: locale,
					replace: safe,
					interpolation: {
						escapeValue: false,
						skipOnVariables: true,
						maxReplaces: 2048,
					},
				}) as string;
			}
			emit("missing-message");
			return key;
		},
		number(value, preset) {
			if (!Number.isFinite(value) || !["decimal", "currency"].includes(preset))
				invalid();
			return new Intl.NumberFormat(
				payload.locale,
				preset === "currency"
					? { style: "currency", currency: "EUR" }
					: { maximumFractionDigits: 2 },
			).format(value);
		},
		date(value, preset) {
			if (!Number.isFinite(value) || !["date", "dateTime"].includes(preset))
				invalid();
			return new Intl.DateTimeFormat(payload.locale, {
				timeZone: payload.timeZone,
				dateStyle: "medium",
				...(preset === "dateTime" ? { timeStyle: "short" as const } : {}),
			}).format(value);
		},
	};
	return { runtime, ready };
}
/** Request-local; callers await initialization before serializing/rendering. */
export async function createI18n(
	input: I18nPayload,
	diagnostic?: (code: Diagnostic) => void,
): Promise<I18nRuntime> {
	const { runtime, ready } = initialize(input, diagnostic);
	await ready;
	return runtime;
}
/** Inline resources initialize synchronously. Used only by the React boundary after canonical payload loading. */
export function createHydrationI18n(input: I18nPayload): I18nRuntime {
	const { runtime, ready } = initialize(input);
	void ready;
	if (!runtime.instance.isInitialized)
		throw new Error("Internationalization initialization incomplete");
	return runtime;
}
export type InitialFormat =
	| {
			id: string;
			kind: "number";
			value: number;
			preset: "decimal" | "currency";
	  }
	| { id: string; kind: "date"; value: number; preset: "date" | "dateTime" };
export async function createPayload(
	input: I18nConfig,
	requested: unknown,
	initialValues: readonly InitialFormat[] = [],
): Promise<I18nPayload> {
	const config = validateConfig(input);
	const runtime = await createI18n({
		...config,
		locale: resolveLocale(config, requested),
		formatted: {},
	});
	// Initial values come from the server. No server/client ICU punctuation assumption.
	if (
		!Array.isArray(initialValues) ||
		Object.getPrototypeOf(initialValues) !== Array.prototype ||
		initialValues.length > 100 ||
		Object.getOwnPropertySymbols(initialValues).length
	)
		invalid();
	const descriptors = Object.getOwnPropertyDescriptors(initialValues);
	if (Object.keys(descriptors).length !== initialValues.length + 1) invalid();
	for (let index = 0; index < initialValues.length; index++) {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
			invalid();
		const candidate: unknown = descriptor.value;
		const format = Object.fromEntries(entries(candidate));
		if (
			Object.keys(format).sort().join(",") !== "id,kind,preset,value" ||
			typeof format.id !== "string" ||
			!keyPart.test(format.id) ||
			forbidden.has(format.id) ||
			Object.hasOwn(runtime.payload.formatted, format.id) ||
			typeof format.value !== "number" ||
			!Number.isFinite(format.value)
		)
			invalid();
		if (
			format.kind === "date" &&
			(format.preset === "date" || format.preset === "dateTime")
		) {
			runtime.payload.formatted[format.id] = runtime.date(
				format.value,
				format.preset,
			);
		} else if (
			format.kind === "number" &&
			(format.preset === "decimal" || format.preset === "currency")
		) {
			runtime.payload.formatted[format.id] = runtime.number(
				format.value,
				format.preset,
			);
		} else invalid();
	}

	return runtime.payload;
}
