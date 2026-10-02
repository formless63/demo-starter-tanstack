import { readFile,writeFile } from 'node:fs/promises';
if(JSON.parse(await readFile('package.json','utf8')).name!=='internationalization-clean-install')throw new Error('Fixture route refuses non-fixture applications');
await writeFile('src/routes/i18n-fixture.tsx',`import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { I18nExample,createExamplePayload } from '../integrations/internationalization/example';
const load=createServerFn({method:'GET'}).handler(()=>createExamplePayload('ar'));
export const Route=createFileRoute('/i18n-fixture')({loader:()=>load(),component:Page});
function Page(){return <I18nExample initial={Route.useLoaderData()}/>;}
`);
