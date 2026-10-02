import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import { createI18n, createPayload, validateConfig } from '../src/integrations/internationalization/i18n';
import { exampleConfig, createExamplePayload, I18nExample } from '../src/integrations/internationalization/I18nExample';
const en = await createExamplePayload('en');
const de = await createExamplePayload('de');
const ar = await createExamplePayload('ar');
const [english,german,arabic] = await Promise.all([createI18n(en),createI18n(de),createI18n(ar)]);
assert.notEqual(english.instance,german.instance);
assert.equal(english.text('hello',{name:'Ada'}),'Hello Ada');
assert.equal(german.text('hello',{name:'Ada'}),'Hallo Ada');
assert.equal(german.text('fallback'),'Fallback message');
assert.equal(german.text('missingValue',{name:'Ada'}),'Hello Ada');
assert.equal(english.text('absent'),'absent');
assert.equal(english.text('hello'),'hello');
assert.equal(english.text('__proto__.x'),'invalid-message');
assert.equal(english.text('hello',{name:'<script>$t(secret){{name}}</script>'}),'Hello <script>$t(secret){{name}}</script>');
assert.deepEqual([0,1,2,3,11,100].map(count => arabic.text('items',{},count)),['لا عناصر','عنصر واحد','عنصران','3 عناصر','11 عنصرًا','100 عنصر']);
assert.equal((await createPayload(exampleConfig,'xx')).locale,'en');
assert.equal((await createPayload(exampleConfig,'__proto__')).locale,'en');
assert.equal(german.payload.formatted.currency,german.number(1234.5,'currency'));
const html = renderToString(<I18nExample initial={ar}/>);
assert.ok(html.includes('disabled=""'),'SSR controls cannot accept a click before hydration handlers attach');assert.ok(html.includes('dir="rtl"'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
for (const messages of [JSON.parse('{"__proto__":"x"}'),{constructor:'bad'},{key:'{{broken}'},{key:'{{-raw}}'},{key:'$t(secret)'},{key:'{{value, currency}}'},{key:'x'.repeat(8193)},{key:()=> 'x'},{key:['x']},Object.defineProperty({},'secret',{enumerable:true,get:()=>{throw new Error('Getter must never run');}})]) {
 assert.throws(() => validateConfig({...exampleConfig,locales:{en:{direction:'ltr',messages:messages as never}}}),/Invalid internationalization/);
}
assert.throws(() => validateConfig({...exampleConfig,timeZone:'Invalid/Zone'}));
assert.throws(() => validateConfig({...exampleConfig,defaultLocale:'xx'}));
let nested: Record<string,unknown> = {value:'end'};for(let i=0;i<8;i++) nested={next:nested};
assert.throws(() => validateConfig({...exampleConfig,locales:{en:{direction:'ltr',messages:nested as never}}}));
assert.throws(() => validateConfig({...exampleConfig,locales:{en:{direction:'ltr',messages:Object.fromEntries(Array.from({length:10001},(_,index)=>[`key${index}`,'value']))}}}));
assert.throws(() => validateConfig({...exampleConfig,locales:{en:{direction:'ltr',messages:Object.fromEntries(Array.from({length:200},(_,index)=>[`key${index}`,'x'.repeat(8192)]))}}}));
let diagnostics:string[]=[];const diagnosticRuntime=await createI18n(en,code=>diagnostics.push(code));diagnosticRuntime.text('hello');assert.deepEqual(diagnostics,['missing-value','missing-message']);
assert.throws(()=>english.number(Number.NaN,'decimal'));assert.throws(()=>english.date(0,'unsafe' as never));
console.info('Internationalization bounded catalog, native CLDR Arabic, escaping, fallback, diagnostics, SSR and concurrent instance isolation passed');

let coercions=0;
assert.throws(()=>validateConfig({...exampleConfig,locales:{en:{direction:{toString(){coercions++;return 'ltr';}} as never,messages:{x:'X'}}}}),/Invalid internationalization/);
assert.equal(coercions,0);
await assert.rejects(()=>createPayload(exampleConfig,'en',[Object.defineProperty({kind:'date',value:0,preset:'date'},'id',{enumerable:true,get(){coercions++;return 'date';}}) as never]),/Invalid internationalization/);
assert.equal(coercions,0);

const hostileFormats: never[]=[];Object.defineProperty(hostileFormats,'0',{enumerable:true,get(){coercions++;return {id:'x',kind:'date',value:0,preset:'date'};}});
await assert.rejects(()=>createPayload(exampleConfig,'en',hostileFormats),/Invalid internationalization/);assert.equal(coercions,0);

const dense=await createI18n({...en,locales:{...en.locales,en:{direction:'ltr',messages:{long:'{{x}}'.repeat(1600)}}}});assert.equal(dense.text('long',{x:'a'}),'a'.repeat(1600));
