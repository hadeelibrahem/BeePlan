// Intentional local/development bootstrap. There is no HTTP promotion endpoint.
// Usage: DATABASE_URL=... node scripts/promote-admin.js user@example.com
const { Client } = require('pg');
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) throw new Error('Usage: DATABASE_URL=... node scripts/promote-admin.js user@example.com');
const client = new Client({ connectionString: process.env.DATABASE_URL });
(async () => { await client.connect(); const result = await client.query("update users set role = 'admin', account_status = 'active', suspended_at = null, suspension_reason = null, token_version = token_version + 1, updated_at = now() where lower(email) = $1 returning id, email, role", [email]); if (!result.rowCount) throw new Error('No user found for that email.'); console.log(`Promoted ${result.rows[0].email} to admin. Sign in again to receive a fresh session.`); await client.end(); })().catch(async (error) => { await client.end().catch(() => undefined); console.error(error.message); process.exitCode = 1; });
