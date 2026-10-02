import { readFile,writeFile } from 'node:fs/promises';
if(JSON.parse(await readFile('package.json','utf8')).name!=='pwa-offline-clean-install')throw new Error('Fixture setup refuses non-fixture applications');
let config=await readFile('vite.config.ts','utf8');
if(!config.includes('pwaOffline'))config="import {pwaOffline} from './scripts/pwa-vite';\n"+config.replace(/plugins:\s*\[/,'plugins: [...pwaOffline(),');
await writeFile('vite.config.ts',config);
await writeFile('src/routes/pwa-test.tsx',"import {createFileRoute} from '@tanstack/react-router';import {PwaPanel} from '../integrations/pwa-offline/PwaPanel';export const Route=createFileRoute('/pwa-test')({head:()=>({links:[{rel:'manifest',href:'/manifest.webmanifest'}]}),component:PwaPanel});");
