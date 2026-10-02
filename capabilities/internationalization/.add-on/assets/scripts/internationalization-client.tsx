import { hydrateRoot } from 'react-dom/client';
import { createI18n } from '../src/integrations/internationalization/i18n';
import { Harness } from './internationalization-example';
const payload=JSON.parse(document.getElementById('data')!.textContent!);
await createI18n(payload);
hydrateRoot(document.getElementById('root')!,<Harness payload={payload}/>);
