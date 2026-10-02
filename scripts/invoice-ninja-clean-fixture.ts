import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
assert.equal(JSON.parse(await readFile('.cta.json', 'utf8')).projectName, 'invoice-ninja-clean-install')
const directory = await mkdtemp(`${tmpdir()}/invoice-lifecycle-`)
const run = (command: string, args: string[], env = process.env) => assert.equal(spawnSync(command, args, { stdio: 'inherit', env }).status, 0, `${command} ${args.join(' ')} failed`)
try {
  run(process.execPath, ['test', 'src/integrations/invoice-ninja'])
  run('node', ['node_modules/vitest/vitest.mjs', 'run', 'src/integrations/invoice-ninja/boundary.test.ts'])
  run(process.execPath, ['scripts/invoice-ninja-database-fixture.ts'])
  run(process.execPath, ['scripts/invoice-ninja-provider.ts'])
  run(process.execPath, ['x', 'tsc', '--noEmit']); run(process.execPath, ['run', 'build'])
  run(process.execPath, ['build', 'scripts/invoice-ninja-database-fixture.ts', '--target=node', `--outfile=${directory}/database.mjs`])
  run('node', [`${directory}/database.mjs`], { ...process.env, INVOICE_FIXTURE_REMOVE: 'true', INVOICE_FIXTURE_BUN: process.execPath })
  run(process.execPath, ['x', 'tsc', '--noEmit'])
}
finally { await rm(directory, { recursive: true, force: true }) }
