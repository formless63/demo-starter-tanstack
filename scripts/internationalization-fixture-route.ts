import { readFile,writeFile } from 'node:fs/promises';
if(JSON.parse(await readFile('package.json','utf8')).name!=='internationalization-clean-install')throw new Error('Fixture route refuses non-fixture applications');
await writeFile('src/routes/i18n-fixture.tsx',`import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { I18nExample,createExamplePayload } from '../integrations/internationalization/I18nExample';
const load=createServerFn({method:'GET'}).inputValidator((locale:string)=>locale).handler(({data})=>createExamplePayload(data));
export const Route=createFileRoute('/i18n-fixture')({validateSearch:(search:Record<string,unknown>)=>({locale:typeof search.locale==='string' && ['en','de','ar'].includes(search.locale)?search.locale:'ar'}),loaderDeps:({search})=>({locale:search.locale}),loader:({deps})=>load({data:deps.locale}),component:Page});
function Page(){const payload=Route.useLoaderData();const navigate=Route.useNavigate();return <I18nExample key={payload.locale} initial={payload} onLocaleCommitted={locale=>navigate({search:{locale}})}/>;}
`);
