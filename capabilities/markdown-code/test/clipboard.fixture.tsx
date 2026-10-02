import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { MarkdownContent } from "../../../src/integrations/markdown-code/MarkdownContent";
import type { MarkdownDocument } from "../../../src/integrations/markdown-code/types";

const model = (text:string):MarkdownDocument => ({version:1,nodes:[{kind:"code",language:"text",text}]});
let root: ReturnType<typeof hydrateRoot> | undefined;
afterEach(async () => {if(root)await act(async()=>root?.unmount());root=undefined;document.body.innerHTML="";vi.unstubAllGlobals();});

test("SSR copy waits for hydration, then retains success and failure feedback", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const writeText = vi.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
 const container = document.createElement("div");document.body.append(container);
 container.innerHTML=renderToString(<MarkdownContent document={model("first\n")} />);
 const button = ()=>container.querySelector("button") as HTMLButtonElement;
 const status = ()=>container.querySelector("output")?.textContent;
 expect(button().disabled).toBe(true);
 button().click();expect(writeText).not.toHaveBeenCalled();
 await act(async()=>{root=hydrateRoot(container,<MarkdownContent document={model("first\n")} />);});
 expect(button().disabled).toBe(false);
 await act(async()=>{button().click();});
 expect(writeText).toHaveBeenLastCalledWith("first\n");expect(status()).toBe("Copied");
 await act(async()=>{button().click();});expect(writeText).toHaveBeenCalledTimes(2);expect(status()).toBe("Copied");
 writeText.mockRejectedValueOnce(new Error("Denied"));
 await act(async()=>{button().click();});expect(status()).toBe("Could not copy. Select the code and copy it manually.");
});

test("deferred clipboard completion cannot change replaced or unmounted content", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 let finish:()=>void = ()=>{};
 const writeText=vi.fn().mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
 const container=document.createElement("div");document.body.append(container);
 container.innerHTML=renderToString(<MarkdownContent document={model("old")} />);
 await act(async()=>{root=hydrateRoot(container,<MarkdownContent document={model("old")} />);});
 await act(async()=>{(container.querySelector("button") as HTMLButtonElement).click();});
 expect(container.querySelector("output")?.textContent).toBe("Copying");
 await act(async()=>{root?.render(<MarkdownContent document={model("new")} />);});
 expect(container.querySelector("output")?.textContent).toBe("");
 await act(async()=>{finish();});expect(container.querySelector("output")?.textContent).toBe("");
 writeText.mockResolvedValueOnce(undefined);
 await act(async()=>{(container.querySelector("button") as HTMLButtonElement).click();});
 expect(writeText).toHaveBeenLastCalledWith("new");expect(container.querySelector("output")?.textContent).toBe("Copied");
 await act(async()=>{(container.querySelector("button") as HTMLButtonElement).click();});
 await act(async()=>{root?.unmount();root=undefined;finish();});
 expect(container.childNodes).toHaveLength(0);
});

for (const outcome of ["resolve", "reject"] as const) {
 test(`same-code document replacement invalidates deferred ${outcome}, while same-document rerender preserves it`, async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = model("same code\n");
  const operations: {resolve:()=>void; reject:(error:Error)=>void}[] = [];
  const writeText = vi.fn().mockImplementation(() => new Promise<void>((resolve, reject) => { operations.push({resolve, reject}); }));
  Object.defineProperty(navigator, "clipboard", {configurable:true, value:{writeText}});
  const container = document.createElement("div"); document.body.append(container);
  container.innerHTML = renderToString(<MarkdownContent document={original} />);
  await act(async () => {root = hydrateRoot(container, <MarkdownContent document={original} />);});
  const button = () => container.querySelector("button") as HTMLButtonElement;
  const status = () => container.querySelector("output")?.textContent;
  await act(async () => {button().click();});
  expect(status()).toBe("Copying"); expect(button().disabled).toBe(true);
  await act(async () => {root?.render(<MarkdownContent document={original} label="Unrelated label update" />);});
  expect(status()).toBe("Copying"); expect(button().disabled).toBe(true);
  await act(async () => {operations[0].resolve();});
  expect(status()).toBe("Copied"); expect(button().disabled).toBe(false);
  await act(async () => {button().click();});
  const replacement = structuredClone(original);
  await act(async () => {root?.render(<MarkdownContent document={replacement} />);});
  expect(status()).toBe(""); expect(button().disabled).toBe(false);
  await act(async () => {button().click();});
  expect(writeText).toHaveBeenCalledTimes(3); expect(status()).toBe("Copying");
  await act(async () => {
   if (outcome === "resolve") operations[1].resolve();
   else operations[1].reject(new Error("Old copy failed"));
  });
  expect(status()).toBe("Copying"); expect(button().disabled).toBe(true);
  await act(async () => {operations[2].resolve();});
  expect(status()).toBe("Copied"); expect(button().disabled).toBe(false);
  expect(writeText).toHaveBeenLastCalledWith("same code\n");
 });
}
