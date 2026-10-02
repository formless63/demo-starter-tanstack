import { createServerFn } from "@tanstack/react-start";

/** Reference content only; applications authorize private documents before returning. */
export const getMarkdownReference = createServerFn({ method: "GET" }).handler(
	async () => {
		const { parseMarkdown } = await import(
			"../integrations/markdown-code/markdown.server"
		);
		return parseMarkdown(
			'# Safe Markdown\n\nNative **React** content from a server-only parser.\n\n[Official documentation](https://markdown-it.github.io/markdown-it/)\n\n![Image description](https://tracker.invalid/pixel.png)\n\n<script>window.markdownExecuted=true</script>\n\n[Blocked link](javascript:alert(1))\n\n```ts\nconst message = "Hello, Markdown"\n```\n\n```unknown\n<script>selectable plaintext</script>\n```\n\n| Feature | Result |\n| --- | --- |\n| HTML | Escaped |\n| Images | Alt text |',
		);
	},
);
