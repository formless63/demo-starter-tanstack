/** Only this closed vocabulary crosses the server/client boundary. */
export const markdownTags = [
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"ul",
	"ol",
	"li",
	"em",
	"strong",
	"s",
	"a",
	"code",
	"hr",
	"br",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
] as const;
export type MarkdownTag = (typeof markdownTags)[number];
export interface HighlightSpan {
	text: string;
	light?: string;
	dark?: string;
}
export type MarkdownNode =
	| { kind: "text"; text: string }
	| {
			kind: "element";
			tag: MarkdownTag;
			children: MarkdownNode[];
			href?: string;
			start?: number;
	  }
	| { kind: "code"; text: string; language: string; lines?: HighlightSpan[][] };
export interface MarkdownDocument {
	version: 1;
	nodes: MarkdownNode[];
}

/** Deliberately narrow: content cannot opt into arbitrary navigation schemes. */
export function safeMarkdownHref(value: string): string | undefined {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject URL controls rather than normalize them.
	if (value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return;
	if (value.startsWith("#")) return value;
	if (value.startsWith("/") && !value.startsWith("//")) return value;
	if (/^mailto:[A-Z0-9._+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value))
		return value;
	try {
		const url = new URL(value);
		if (
			/^https:\/\//i.test(value) &&
			url.protocol === "https:" &&
			!url.username &&
			!url.password
		)
			return url.href;
	} catch {
		/* Invalid or unsupported relative URL. */
	}
}
