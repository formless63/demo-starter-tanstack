import { createHmac, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import pg from 'pg'

test('Invoice Ninja scoped local state, queued cancellation and guarded repeated requests', async ({ page, request, context, baseURL }) => {
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL })
  const owner = randomUUID(), other = randomUUID(), token = randomUUID(), invoice = randomUUID(), foreign = randomUUID(), client = randomUUID(), operation = randomUUID()
  const secret = process.env.BETTER_AUTH_SECRET ?? 'development-only-secret-change-me-now'
  const encoded = encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`)
  const headers = { origin: baseURL!, cookie: `better-auth.session_token=${encoded}; __Secure-better-auth.session_token=${encoded}` }
  const api = (action: string, data: object) => request.post(`/api/integrations/invoice-ninja/${action}`, { headers, data })
  try {
    expect((await request.post('/api/integrations/invoice-ninja/listInvoices', { headers: { origin: baseURL! }, data: {} })).status()).toBe(401)
    for (const id of [owner, other]) await pool.query('insert into "user"(id,name,email,email_verified,created_at,updated_at) values($1,$2,$3,true,now(),now())', [id, 'Invoice fixture', `${id}@example.test`])
    await pool.query('insert into session(id,user_id,token,expires_at,created_at,updated_at) values($1,$2,$3,now()+interval \'1 hour\',now(),now())', [randomUUID(), owner, token])
    for (const [id, scope, kind] of [[invoice, owner, 'invoice'], [foreign, other, 'invoice'], [client, owner, 'client']]) await pool.query('insert into invoice_ninja_binding(id,scope_kind,scope_id,local_resource_id,connection_id,resource_kind,remote_id,created_at) values($1,\'user\',$2,$4,\'default\',$3,$4,now())', [id, scope, kind, id])
    await pool.query('insert into invoice_ninja_invoice(binding_id,number,status,currency,amount,balance,synced_at) values($1,\'LOCAL-1\',\'draft\',\'USD\',\'25\',\'0\',now()),($2,\'PRIVATE_FOREIGN\',\'draft\',\'USD\',\'900\',\'0\',now())', [invoice, foreign])
    await pool.query('insert into invoice_ninja_operation(id,scope_kind,scope_id,actor_user_id,connection_id,kind,status,binding_id,caller_key,digest,created_at,updated_at) values($1,\'user\',$2,$2,\'default\',\'reconcile_client\',\'queued\',$3,$4,$5,now(),now())', [operation, owner, client, randomUUID(), '0'.repeat(64)])
    const listing = await api('listInvoices', {}); expect(listing.status()).toBe(200); expect(listing.headers()['cache-control']).toBe('no-store'); expect((await listing.json()).items).toHaveLength(1)
    expect((await api('getInvoice', { bindingId: foreign })).status()).toBe(404)
    expect((await api('requestDraftInvoice', { clientBindingId: client, send_email: true })).status()).toBe(400)
    await context.addCookies([{ name: 'better-auth.session_token', value: encoded, domain: new URL(baseURL!).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }, { name: '__Secure-better-auth.session_token', value: encoded, domain: new URL(baseURL!).hostname, path: '/', httpOnly: true, sameSite: 'Lax', secure: true }])
    await page.goto('/app/invoices')
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Refresh local invoices' }).click()
    await expect(page.getByText('LOCAL-1', { exact: true })).toBeVisible(); expect(await page.content()).not.toContain('PRIVATE_FOREIGN')
    await page.getByLabel('Client binding ID').fill(client)
    let calls = 0, release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/integrations/invoice-ninja/requestClientReconciliation', async route => { calls++; await gate; await route.fulfill({ json: { operationId: operation, status: 'queued' } }) })
    const reconcile = page.getByRole('button', { name: 'Reconcile client', exact: true })
    try {
      await reconcile.click(); await expect.poll(() => calls).toBe(1); await expect(reconcile).toBeDisabled()
      await reconcile.evaluate(button => (button as HTMLButtonElement).click()); expect(calls).toBe(1)
    }
    finally { release() }
    await expect(page.getByRole('heading', { name: 'Operation queued' })).toBeVisible()
    await page.getByRole('button', { name: 'Refresh operation' }).click(); await expect(page.getByRole('heading', { name: 'Operation queued' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel queued operation' }).click(); await expect(page.getByRole('heading', { name: 'Operation cancelled' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel queued operation' })).toBeDisabled()
    await context.clearCookies(); await page.getByRole('button', { name: 'Refresh local invoices' }).click()
    await expect(page.getByRole('alert')).toHaveText('Authentication required.'); await expect(page.getByText('LOCAL-1', { exact: true })).toHaveCount(0)
    await page.unrouteAll({ behavior: 'wait' })
  }
  finally {
    await pool.query('delete from invoice_ninja_operation where id=$1', [operation])
    await pool.query('delete from invoice_ninja_invoice where binding_id=any($1)', [[invoice, foreign]])
    await pool.query('delete from invoice_ninja_binding where id=any($1)', [[invoice, foreign, client]])
    await pool.query('delete from session where user_id=any($1)', [[owner, other]])
    await pool.query('delete from "user" where id=any($1)', [[owner, other]]); await pool.end()
  }
})
