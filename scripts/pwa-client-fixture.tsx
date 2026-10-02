import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PwaPanel } from '../src/integrations/pwa-offline/PwaPanel';
function Fixture(){const [visible,setVisible]=useState(true);return <main><h1>PWA production fixture</h1><button type="button" onClick={()=>setVisible(value=>!value)}>Toggle panel</button>{visible&&<PwaPanel/>}<label>Unsaved draft<textarea/></label><a href="/private">Private page</a></main>;}
const root=document.getElementById('root');if(!root)throw new Error('Missing fixture root');createRoot(root).render(<Fixture/>);
