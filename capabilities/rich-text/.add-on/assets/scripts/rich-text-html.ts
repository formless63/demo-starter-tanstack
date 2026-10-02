/** Explicit UTF-8 is required: the SSR fallback contains non-ASCII text. */
export const richTextFixtureContentTypes = {
 html: 'text/html; charset=utf-8',
 script: 'application/javascript; charset=utf-8',
};
export function richTextFixtureHtml(body: string): string {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rich text fixture</title></head><body><div id="root">${body}</div><script type="module" src="/client.js"></script></body></html>`;
}
