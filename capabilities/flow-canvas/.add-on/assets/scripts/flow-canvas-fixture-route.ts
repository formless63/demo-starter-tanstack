import {readFile,writeFile} from 'node:fs/promises';
if(JSON.parse(await readFile('package.json','utf8')).name!=='flow-canvas-clean-install')throw new Error('Refusing non-fixture route');
await writeFile('src/routes/flow-fixture.tsx',`import {createFileRoute} from '@tanstack/react-router';\nimport {FlowExample} from '../../scripts/flow-canvas-example';\nexport const Route=createFileRoute('/flow-fixture')({component:FlowExample});\n`);
