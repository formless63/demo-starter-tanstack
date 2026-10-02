import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
assert.equal(JSON.parse(await readFile('package.json','utf8')).name,'internationalization-clean-install');
process.env.NODE_ENV='production';
const runtime=await import(pathToFileURL(resolve('dist/server/server.js')).href);
assert.equal(typeof runtime.default.fetch,'function');
// The application route owns its explicit default search value. Native SSR canonicalizes it.
const missingLocale=await runtime.default.fetch(new Request('http://fixture.local/i18n-fixture'));
assert.equal(missingLocale.status,307,'Missing locale is the native canonical-search redirect');
assert.equal(missingLocale.headers.get('location'),'/i18n-fixture?locale=ar','Redirect must stay on the fixture route with its declared Arabic default');
// Request the known canonical URL directly; never follow an arbitrary/auth/external redirect.
const response=await runtime.default.fetch(new Request('http://fixture.local/i18n-fixture?locale=ar'));
assert.equal(response.status,200,`Canonical Arabic fixture must render, got ${response.status} location=${response.headers.get('location')}`);const html=await response.text();
assert.ok(html.includes('dir="rtl"'));assert.ok(html.includes('مرحبًا Ada'));assert.ok(html.includes('عنصران'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
console.info('Generated TanStack production Node handler Arabic SSR and escaped literal passed');
