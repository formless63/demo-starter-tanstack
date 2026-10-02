import { useState } from 'react';
import { I18nExample,exampleLoader } from '../src/integrations/internationalization/example';
import type { I18nPayload } from '../src/integrations/internationalization/i18n';
export function Harness({payload}:{payload:I18nPayload}) {
 const [visible,setVisible]=useState(true);
 const [failure,setFailure]=useState<'none'|'reject'|'invalid'>('none');
 return <><button type="button" onClick={()=>setFailure('reject')}>Fail changes</button><button type="button" onClick={()=>setFailure('invalid')}>Invalid changes</button><button type="button" onClick={()=>setFailure('none')}>Restore changes</button><button type="button" onClick={()=>setVisible(value=>!value)}>Toggle example</button>{visible && <I18nExample initial={payload} load={async(locale,_signal)=>{if(failure==='reject')throw new Error('Private loader details');const next=await exampleLoader(locale,new AbortController().signal);if(failure==='invalid')next.locales.en.messages={key:'{{broken}'};return next;}}/>}</>;
}
