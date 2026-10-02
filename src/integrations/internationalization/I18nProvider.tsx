import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { I18nextProvider } from "react-i18next";
import {
	createHydrationI18n,
	createI18n,
	type I18nPayload,
	type I18nRuntime,
} from "./i18n";

const Context = createContext<I18nRuntime | null>(null);
export function useI18n(): I18nRuntime {
	const value = useContext(Context);
	if (!value) throw new Error("Internationalization provider required");
	return value;
}
export type LocaleLoader = (
	locale: string,
	signal: AbortSignal,
) => Promise<I18nPayload>;
export function I18nProvider({
	payload,
	children,
}: {
	payload: I18nPayload;
	children: ReactNode;
}) {
	const runtime = useMemo(() => createHydrationI18n(payload), [payload]);
	return (
		<I18nextProvider i18n={runtime.instance}>
			<Context.Provider value={runtime}>{children}</Context.Provider>
		</I18nextProvider>
	);
}
/** Each completion builds its own engine; stale work cannot mutate the visible engine. */
export function useLocaleLoader(initial: I18nPayload, load: LocaleLoader) {
	const [payload, setPayload] = useState(initial);
	const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
	const generation = useRef(0);
	const controller = useRef<AbortController | null>(null);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			generation.current++;
			controller.current?.abort();
		};
	}, []);
	const cancel = () => {
		generation.current++;
		controller.current?.abort();
		controller.current = null;
		if (mounted.current) setStatus("idle");
	};
	const change = async (locale: string) => {
		const id = ++generation.current;
		controller.current?.abort();
		const current = new AbortController();
		controller.current = current;
		setStatus("loading");
		try {
			const next = await load(locale, current.signal);
			const runtime = await createI18n(next);
			if (
				!mounted.current ||
				current.signal.aborted ||
				generation.current !== id
			)
				return false;
			setPayload(runtime.payload);
			setStatus("idle");
			return true;
		} catch {
			if (
				mounted.current &&
				!current.signal.aborted &&
				generation.current === id
			)
				setStatus("error");
			return false;
		}
	};
	return { payload, status, change, cancel };
}
