import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { MarkdownContent } from "../../../src/integrations/markdown-code/MarkdownContent";

const text = { kind: "text", text: "Content" };
const element = (tag: string, ...children: unknown[]) => ({ kind: "element", tag, children });
const code = { kind: "code", language: "text", text: "Code" };
let root: ReturnType<typeof hydrateRoot> | undefined;
afterEach(async () => {
 if (root) await act(async () => root?.unmount());
 root = undefined;
 document.body.innerHTML = "";
 vi.restoreAllMocks();
 vi.unstubAllGlobals();
});

for (const [name, node] of [
 ["surrogate href", {...element("a", text),href:"/\ud800"}],
 ["CR text", {kind:"text",text:"a\rb"}],
 ["CRLF text", {kind:"text",text:"a\r\nb"}],
 ["NUL text", {kind:"text",text:"a\u0000b"}],
 ["lone high surrogate", {kind:"text",text:"a\ud800b"}],
 ["lone low surrogate", {kind:"text",text:"a\udc00b"}],
 ["valid surrogate pair", {kind:"text",text:"a😀b"}],
 ["CR code", {kind:"code",language:"text",text:"a\rb"}],
 ["split surrogate spans", {kind:"code",language:"javascript",text:"😀",lines:[[{text:"\ud83d"},{text:"\ude00"}]]}],
 ["nested paragraph", element("p", element("p", text))],
 ["block in phrasing", element("em", element("blockquote", text))],
 ["code block in paragraph", element("p", code)],
 ["nested anchor through emphasis", {...element("a", element("em", {...element("a", text), href:"/inner"})), href:"/outer"}],
 ["table foster parenting", element("table", text, element("p", text), element("tr", element("td", text)))],
 ["invalid table section", element("tbody", element("td", text))],
 ["invalid list children", element("ul", text, element("p", text), element("li", text))],
 ["orphan structural nodes", element("td", element("li", text))],
 ["nested heading", element("h1", element("h2", text))],
 ["void children", element("br", text)],
] as const) {
 test(`unknown document ${name} produces parser-stable SSR and clean hydration`, async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const errors: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {errors.push(args);});
  const payload = {version:1, nodes:[element("p", {kind:"text", text:"Stable marker"}), node]};
  const container = document.createElement("div"); document.body.append(container);
  const html = renderToString(<MarkdownContent document={payload} />);
  container.innerHTML = html;
  expect(container.innerHTML).toBe(html.replace(/<(br|hr)\/>/g, "<$1>"));
  await act(async () => { root = hydrateRoot(container, <MarkdownContent document={payload} />, {onRecoverableError:error => errors.push(error)}); });
  expect(container.textContent).toContain("Stable marker");
  expect(errors).toEqual([]);
 });
}
