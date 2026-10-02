import { readFile,writeFile } from 'node:fs/promises';
if (JSON.parse(await readFile('package.json','utf8')).name !== 'markdown-code-clean-install') throw new Error('Fixture route refuses non-fixture applications');
await writeFile('src/routes/markdown-fixture.tsx',`import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { MarkdownContent } from '../integrations/markdown-code/MarkdownContent';
import '../integrations/markdown-code/markdown-code.css';
const load = createServerFn({method:'GET'}).handler(async () => {
 const { parseMarkdown } = await import('../integrations/markdown-code/markdown.server');
 return parseMarkdown('# Generated consumer\\n\\n**Installed module**\\n\\n\\\`\\\`\\\`ts\\nconst value = 42\\n\\\`\\\`\\\`');
});
export const Route = createFileRoute('/markdown-fixture')({loader:() => load(),component:Page});
function Page() {return <MarkdownContent document={Route.useLoaderData()} />;}
`);
