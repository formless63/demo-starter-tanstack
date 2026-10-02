// Root-only compilation helper for the byte-level DOM hydration regression.
import { resolve, join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { UnicodeExample } from '../capabilities/rich-text/test/unicode-example';
import { RichTextExample } from '../capabilities/rich-text/.add-on/assets/src/integrations/rich-text/Example';
import { richTextFixtureHtml } from '../capabilities/rich-text/.add-on/assets/scripts/rich-text-html';
const directory=process.argv[2];
if(!directory)throw new Error('Missing fixture directory');
const unicode=process.env.RICH_TEXT_UNICODE_FIXTURE==='1';
await Bun.write(join(directory,'index.html'),richTextFixtureHtml(renderToString(createElement(unicode?UnicodeExample:RichTextExample))));
const build=await Bun.build({entrypoints:[resolve(unicode?'capabilities/rich-text/test/unicode-client.tsx':'capabilities/rich-text/.add-on/assets/scripts/rich-text-client.tsx')],outdir:directory,target:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
if(!build.success)throw new Error(build.logs.join('\n'));
