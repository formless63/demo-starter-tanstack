import { useState } from 'react';
import { MarkdownContent } from '../src/integrations/markdown-code/MarkdownContent';
import type { MarkdownDocument } from '../src/integrations/markdown-code/types';
export function MarkdownExample({ document }: {document:MarkdownDocument}) {
 const [visible,setVisible] = useState(true);
 const [dark,setDark] = useState(false);
 const [replacement,setReplacement] = useState(false);
 const current: MarkdownDocument = replacement ? {version:1,nodes:document.nodes.map(node => node.kind === 'code' ? {kind:'code',language:node.language,text:'replacement code\n'} : node)} : document;
 return <main className={dark ? 'dark' : ''}>
  <h1>Markdown fixture</h1>
  <button type="button" onClick={() => setVisible(value => !value)}>Toggle content</button>
  <button type="button" onClick={() => setDark(value => !value)}>Toggle theme</button>
  <button type="button" onClick={() => setReplacement(value => !value)}>Replace code</button>
  {visible && <MarkdownContent document={current} />}
 </main>;
}
