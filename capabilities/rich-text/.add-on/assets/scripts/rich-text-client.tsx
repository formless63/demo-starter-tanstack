import {hydrateRoot} from 'react-dom/client';
import {RichTextExample} from '../src/integrations/rich-text/Example';
const root=document.getElementById('root');if(!root)throw new Error('Missing fixture root');
hydrateRoot(root,<RichTextExample/>);
