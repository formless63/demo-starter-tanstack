import assert from 'node:assert/strict'
import { readdir, readFile, writeFile, rm } from 'node:fs/promises'
assert.equal(JSON.parse(await readFile('.cta.json', 'utf8')).projectName, 'invoice-ninja-clean-install')
// Fixture producer/workers must already be stopped. Retain application-owned
// schema/types, applied migration history and all provider/local data.
let registry = await readFile('src/integrations/jobs/registry.ts', 'utf8')
registry = registry.replace(/^import .*referenceInvoiceNinjaJobs.*\n/m, '').replace(/\s*\.\.\.referenceInvoiceNinjaJobs,\n/, '\n')
await writeFile('src/integrations/jobs/registry.ts', registry)
for (const file of await readdir('src/integrations/invoice-ninja')) if (!['schema.ts', 'validation.ts', 'errors.ts'].includes(file)) await rm(`src/integrations/invoice-ninja/${file}`)
await rm('src/lib/invoice-ninja.server.ts')
for (const file of await readdir('scripts')) if (file.startsWith('invoice-ninja-')) await rm(`scripts/${file}`)
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
for (const key of Object.keys(pkg.scripts)) if (key.startsWith('invoice-ninja:')) delete pkg.scripts[key]
await writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n')
assert(registry.includes('referenceWebhookJobs')); assert(registry.includes('starter.echo'))
assert(await readFile('drizzle/0009_invoice_ninja_v1.sql', 'utf8'))
