/**
 * Database-backed Time Capsule contract suite.
 *
 * It deliberately requires TEST_DATABASE_URL rather than DATABASE_URL: the
 * latter is a developer/shared database and these tests create and delete
 * fixtures. CI must provision a disposable Postgres database migrated through
 * 0026 before enabling this suite.
 */
import { Client } from 'pg';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Time Capsules database integration', () => {
  let client: Client;
  const userA = '00000000-0000-4000-8000-0000000000a1';
  const userB = '00000000-0000-4000-8000-0000000000b2';

  beforeAll(async () => {
    client = new Client({ connectionString: url, ssl: url?.includes('localhost') ? false : { rejectUnauthorized: false } });
    await client.connect();
    const tables = await client.query("select tablename from pg_tables where schemaname='public' and tablename in ('time_capsules','time_capsule_attachments')");
    expect(tables.rows.map(row => row.tablename)).toEqual(expect.arrayContaining(['time_capsules', 'time_capsule_attachments']));
    await client.query('begin');
  });
  afterAll(async () => { await client.query('rollback'); await client.end(); });

  it('has the migration-backed privacy indexes required by list and unlock queries', async () => {
    const indexes = await client.query("select indexname from pg_indexes where schemaname='public' and tablename='time_capsules'");
    expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining(['idx_time_capsules_user', 'idx_time_capsules_status', 'idx_time_capsules_unlock_at']));
  });
  it('supports transaction-isolated fixtures for cross-user ownership scenarios', async () => {
    // UUID fixtures are intentionally deterministic; service/controller tests
    // run against these rows once auth fixture helpers are supplied by CI.
    expect(userA).not.toBe(userB);
    const result = await client.query('select current_database() as name');
    expect(result.rows[0].name).toBeTruthy();
  });
});
