// Controlled, idempotent bootstrap. Never called from API startup or public HTTP routes.
// Usage: SUPER_ADMIN_EMAIL=owner@example.com DATABASE_URL=... node scripts/bootstrap-super-admin.js
const { Client } = require('pg');
const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) throw new Error('Set SUPER_ADMIN_EMAIL and DATABASE_URL.');
const client = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await client.connect();
  const result = await client.query("update users set role = 'super_admin', account_status = 'active', suspended_at = null, suspension_reason = null, token_version = token_version + 1, updated_at = now() where lower(email) = $1 returning id, email, role", [email]);
  if (!result.rowCount) throw new Error('No user found for that email. Create the normal account first.');
  console.log(`Bootstrapped ${result.rows[0].email} as super_admin. Sign in again to receive a fresh session.`);
  await client.end();
})().catch(async (error) => { await client.end().catch(() => undefined); console.error(error.message); process.exitCode = 1; });
