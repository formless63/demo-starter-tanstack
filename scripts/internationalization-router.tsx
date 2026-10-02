import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Supplemental native Router integration, not a replacement for Chromium gates.
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/i18n?locale=ar'});
const previous=new Map<string,PropertyDescriptor|undefined>();
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','navigator','IS_REACT_ACT_ENVIRONMENT','scrollTo']){
 previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
 Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='scrollTo'?()=>{}:dom.window[key]});
}
const React=await import('react');
const {createRoot}=await import('react-dom/client');
const {createRouter,createRootRoute,createRoute,createMemoryHistory,RouterProvider}=await import('@tanstack/react-router');
const {I18nExample,createExamplePayload}=await import('../src/integrations/internationalization/I18nExample');
const ar=await createExamplePayload('ar');const en=await createExamplePayload('en');
let release!:()=>void;const delayed=new Promise<void>(resolve=>{release=resolve;});let started=false;
const rootRoute=createRootRoute();
const route=createRoute({getParentRoute:()=>rootRoute,path:'/i18n',validateSearch:(search:Record<string,unknown>)=>({locale:typeof search.locale==='string'?search.locale:'ar'}),loaderDeps:({search})=>search,loader:async({deps})=>{if(deps.locale==='en'){started=true;await delayed;return en;}return ar;},component:Page});
function Page(){const payload=route.useLoaderData() as typeof ar;return React.createElement(I18nExample,{key:payload.locale,initial:payload,load:async()=>en,onLocaleCommitted:(locale:string)=>navigateFixture({to:"/i18n",search:{locale}})});}
const history=createMemoryHistory({initialEntries:['/i18n?locale=ar']});
const router=createRouter({routeTree:rootRoute.addChildren([route]),history,defaultPendingMs:100000});
// This isolated fixture route is intentionally outside the reference app's ambient Router Register.
const navigateFixture=router.navigate as unknown as (options:{to:'/i18n';search:{locale:string}})=>Promise<void>;
const root=createRoot(document.getElementById('root')!);
const flush=()=>new Promise(resolve=>setTimeout(resolve,50));
const greeting=()=>document.querySelector('[data-testid=greeting]')?.textContent;
const english=()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='en') as HTMLButtonElement;
try {
 await React.act(async()=>{root.render(React.createElement(RouterProvider,{router}));await flush();});
 assert.equal(greeting(),'مرحبًا Ada');assert.equal(english().disabled,false);
 await React.act(async()=>{english().click();await flush();});
 assert.equal(started,true);assert.equal(history.location.href,'/i18n?locale=en');
 assert.equal(greeting(),'مرحبًا Ada','A held native navigation must still display canonical committed Arabic');
 await React.act(async()=>{history.back();await flush();});
 assert.equal(history.location.href,'/i18n?locale=ar');assert.equal(greeting(),'مرحبًا Ada');
 await React.act(async()=>{release();await flush();});
 assert.equal(history.location.href,'/i18n?locale=ar');assert.equal(greeting(),'مرحبًا Ada','Late English completion cannot overwrite Back to original Arabic route');
 await React.act(async()=>{english().click();await flush();});
 assert.equal(history.location.href,'/i18n?locale=en');assert.equal(greeting(),'Hello Ada','Committed native route updates canonical rendered payload');
 await React.act(async()=>{history.back();await flush();});assert.equal(greeting(),'مرحبًا Ada');
 await React.act(async()=>{history.forward();await flush();});assert.equal(greeting(),'Hello Ada');
 console.info('Actual TanStack Router held navigation → Back → late completion and committed Back/Forward passed');
}finally{
 release();await React.act(async()=>root.unmount());history.destroy();dom.window.close();
 for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
}
