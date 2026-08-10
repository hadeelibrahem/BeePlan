# Isolated API test database

Time Capsule persistence tests require a disposable local PostgreSQL database named `beeplan_test` (or `beeplan_test_*`). Never set `TEST_DATABASE_URL` to the shared `DATABASE_URL`.

```powershell
$env:TEST_DATABASE_URL='postgresql://<local-user>:<local-password>@127.0.0.1:5432/beeplan_test'
npm run db:migrate:test
npm run test:e2e -- time-capsules.db.e2e-spec.ts
```

The migration command rejects a missing URL, a URL matching `DATABASE_URL`, and database names outside `beeplan_test` / `beeplan_test_*`. The integration suite rolls back its fixtures.
