import { createServerFn } from "@tanstack/react-start";
import { createExamplePayload } from "../integrations/internationalization/I18nExample";
export const getI18nReference = createServerFn({ method: "GET" })
	.inputValidator((input: { locale?: string }) => ({
		locale:
			typeof input.locale === "string" && input.locale.length <= 64
				? input.locale
				: undefined,
	}))
	.handler(({ data }) => createExamplePayload(data.locale));
