import { hydrateRoot } from 'react-dom/client';
import { MarkdownExample } from './markdown-code-example';
import type { MarkdownDocument } from '../src/integrations/markdown-code/types';
const data = JSON.parse(document.getElementById('data')?.textContent ?? '{}') as MarkdownDocument;
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
hydrateRoot(root,<MarkdownExample document={data}/>);
