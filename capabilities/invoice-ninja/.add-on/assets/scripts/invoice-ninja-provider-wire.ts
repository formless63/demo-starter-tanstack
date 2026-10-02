import assert from 'node:assert/strict'
import { InvoiceNinjaError } from '../src/integrations/invoice-ninja/errors'
import { providerRequest, createProviderDraft } from '../src/integrations/invoice-ninja/transport.server'
import { entity } from '../src/integrations/invoice-ninja/projection'

assert.equal(Number(process.versions.node.split('.')[0]), 24)
const clientId = process.env.GS_CLIENT_ID, apiToken = process.env.GS_FIXTURE_TOKEN
assert(clientId && apiToken)
// This process shares the isolated provider container's network namespace.
// The literal loopback rule stays intact; no host port or external API is used.
const connection = { baseUrl: 'http://127.0.0.1:8000', apiToken }
let stage = 'client_get'
try {
  assert.equal((await providerRequest(connection, 'client', clientId)).status, 200)
  stage = 'draft_post'
  const response = await createProviderDraft(connection, {
    clientRemoteId: clientId,
    policy: { currencyId: '1', currency: 'USD', configurationIdentity: 'disposable', verifiedPin: '382020072bc79e8c7ede49f7e9ce91b0aeb1a051', numericStrings: true, unsent: true, zeroTax: true, zeroDiscount: true },
    input: { clientBindingId: '1c2ec89c-8de9-449f-bb3e-e04a544c7d4e', idempotencyKey: 'native-fixture', invoiceDate: '2026-10-02', numbering: { mode: 'explicit', number: 'GS-FIXTURE-1' }, lines: [{ description: 'Disposable compatibility check', quantity: '1.25', unitCost: '20.0000' }] },
  })
  assert.equal(response.status, 200)
  const raw = { data: entity(response.body) }
  stage = 'client_identity'; assert.equal(raw.data.client_id, clientId)
  stage = 'draft_status'; assert.equal(raw.data.status_id, '1')
  stage = 'auto_bill_disabled'; assert.equal(raw.data.auto_bill_enabled, false)
  stage = 'exact_amount'; assert.equal(raw.data.amount, '25')
  // Native drafts have zero outstanding balance until explicitly marked sent.
  // v5.13.43 InvoiceFactory::create / Invoice\\MarkSent own that transition.
  stage = 'exact_balance'; assert.equal(raw.data.balance, '0')
  stage = 'invoice_get'; assert.equal((await providerRequest(connection, 'invoice', String(raw.data.id))).status, 200)
  console.info('Native provider wire assertions passed on Node24')
}
catch (error) {
  // Only locally authored stage names and closed package error codes leave the
  // isolated fixture. Never print assertion values, provider bodies or tokens.
  const code = error instanceof InvoiceNinjaError ? error.code : 'assertion_or_runtime'
  console.error(`GS_NATIVE_WIRE_FAILURE stage=${stage} code=${code}`)
  process.exitCode = 1
}
