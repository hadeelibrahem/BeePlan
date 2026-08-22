# BeePlan Admin development setup

There is intentionally no public API for promotion. After the Admin foundation
schema exists in your development database, promote a known existing account
from `apps/api`:

```powershell
$env:DATABASE_URL='postgresql://...'
node scripts/promote-admin.js you@example.com
```

The command updates only the supplied email, marks it active, increments
`token_version`, and prints the promoted identity. Sign out and back in before
opening `/admin` so the browser uses a fresh session.
