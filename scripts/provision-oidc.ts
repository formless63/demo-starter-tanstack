import { config } from 'dotenv'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

config({ path: ['.env.local', '.env'] })
const adminUrl = process.env.DEV_OIDC_ADMIN_URL?.replace(/\/$/, '')
const apiKey = process.env.DEV_OIDC_API_KEY
const appUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (!adminUrl || !apiKey) { console.error('Missing DEV_OIDC_ADMIN_URL or DEV_OIDC_API_KEY. Add them to .env.local and retry.'); process.exit(1) }
const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey }
async function request(path: string, init?: RequestInit) { try { const response = await fetch(`${adminUrl}${path}`, { ...init, headers: { ...headers, ...init?.headers } }); if (!response.ok) throw new Error(`${response.status} ${await response.text()}`); return response.status === 204 ? null : response.json() } catch (error) { throw new Error(`Pocket ID at ${adminUrl} is unavailable or rejected the request: ${error instanceof Error ? error.message : error}`) } }

const id = 'tanstack-launchpad-dev'
const payload = { id, name: 'TanStack Launchpad (development)', description: 'Local TanStack Start development client', callbackURLs: [`${appUrl}/api/auth/callback/oidc`], logoutCallbackURLs: [appUrl], isPublic: false, pkceEnabled: true, skipConsent: true, requiresReauthentication: false, requiresPushedAuthorizationRequests: false, credentials: { secrets: [] }, accessTokenDurationMinutes: 15, refreshTokenDurationMinutes: 10080 }
const listed = await request('/api/oidc/clients?pagination[limit]=100') as { data: Array<{ id: string }> }
if (listed.data.some((client) => client.id === id)) await request(`/api/oidc/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
else await request('/api/oidc/clients', { method: 'POST', body: JSON.stringify(payload) })

let local = ''; try { local = await readFile('.env.local', 'utf8') } catch {}
let secret = local.match(/^OIDC_CLIENT_SECRET=(.+)$/m)?.[1]
if (!secret) { secret = randomBytes(32).toString('base64url'); await request(`/api/oidc/clients/${id}/secrets`, { method: 'POST', body: JSON.stringify({ secret }) }) }
const issuer = `${adminUrl}/.well-known/openid-configuration`
const values = { OIDC_DISCOVERY_URL: issuer, OIDC_CLIENT_ID: id, OIDC_CLIENT_SECRET: secret }
for (const [key, value] of Object.entries(values)) { const line = `${key}=${value}`; local = new RegExp(`^${key}=.*$`, 'm').test(local) ? local.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${local.trimEnd()}\n${line}\n` }
await writeFile('.env.local', local, { mode: 0o600 }); console.info(`Provisioned ${id}; credentials saved to ignored .env.local.`)
