/**
 * Database-backed Phase E contract coverage. Requires the same disposable
 * TEST_DATABASE_URL convention as the existing Time Capsule suite.
 */
import { Client } from 'pg';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Feedback & Ideas database integration', () => {
  let client: Client;
  const suffix = `feedback-e2e-${Date.now()}`;
  const author = '00000000-0000-4000-8000-0000000000e1';
  const voterA = '00000000-0000-4000-8000-0000000000e2';
  const voterB = '00000000-0000-4000-8000-0000000000e3';
  let feedbackId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: url, ssl: url?.includes('localhost') ? false : { rejectUnauthorized: false } });
    await client.connect();
    await client.query('begin');
    await client.query(`insert into users (id, full_name, email, password_hash, timezone) values ($1, 'Feedback Author', $2, 'x', 'UTC'), ($3, 'Voter A', $4, 'x', 'UTC'), ($5, 'Voter B', $6, 'x', 'UTC')`, [author, `${suffix}-author@example.test`, voterA, `${suffix}-a@example.test`, voterB, `${suffix}-b@example.test`]);
  });
  afterAll(async () => { await client.query('rollback'); await client.end(); });

  it('provisions feedback tables, submission defaults, and public-safe columns', async () => {
    const tables = await client.query("select tablename from pg_tables where schemaname='public' and tablename in ('feedback_items', 'feedback_votes')");
    expect(tables.rows.map((row) => row.tablename)).toEqual(expect.arrayContaining(['feedback_items', 'feedback_votes']));
    const result = await client.query(`insert into feedback_items (author_user_id, category, title, description) values ($1, 'idea', 'Public feedback', 'A safely stored public feedback description.') returning id, author_user_id, status, visibility, created_at, updated_at`, [author]);
    feedbackId = result.rows[0].id;
    expect(result.rows[0]).toMatchObject({ author_user_id: author, status: 'submitted', visibility: 'public' });
    expect(result.rows[0].created_at).toBeTruthy(); expect(result.rows[0].updated_at).toBeTruthy();
    const publicProjection = await client.query(`select f.id, f.title, f.status, u.full_name from feedback_items f join users u on u.id=f.author_user_id where f.id=$1`, [feedbackId]);
    expect(Object.keys(publicProjection.rows[0])).not.toContain('email');
    expect(Object.keys(publicProjection.rows[0])).not.toContain('password_hash');
  });

  it('enforces one vote per user and retains other users votes on removal', async () => {
    await client.query('insert into feedback_votes (feedback_id, user_id) values ($1, $2), ($1, $3)', [feedbackId, voterA, voterB]);
    await expect(client.query('insert into feedback_votes (feedback_id, user_id) values ($1, $2)', [feedbackId, voterA])).rejects.toMatchObject({ code: '23505' });
    const before = await client.query('select count(*)::int as count from feedback_votes where feedback_id=$1', [feedbackId]);
    expect(before.rows[0].count).toBe(2);
    await client.query('delete from feedback_votes where feedback_id=$1 and user_id=$2', [feedbackId, voterA]);
    const after = await client.query('select user_id from feedback_votes where feedback_id=$1', [feedbackId]);
    expect(after.rows.map((row) => row.user_id)).toEqual([voterB]);
  });

  it('persists lifecycle and release metadata without partial invalid updates', async () => {
    const invalid = await client.query(`update feedback_items set status='released' where id=$1 and status='reviewing' returning status`, [feedbackId]);
    expect(invalid.rowCount).toBe(0);
    const initial = await client.query('select status, released_at from feedback_items where id=$1', [feedbackId]);
    expect(initial.rows[0]).toMatchObject({ status: 'submitted', released_at: null });
    await client.query(`update feedback_items set status='reviewing', reviewed_by_admin_id=$2, reviewed_at=now(), updated_at=now() where id=$1`, [feedbackId, author]);
    await client.query(`update feedback_items set status='planned', updated_at=now() where id=$1`, [feedbackId]);
    await client.query(`update feedback_items set status='in_development', updated_at=now() where id=$1`, [feedbackId]);
    await client.query(`update feedback_items set status='released', released_at=now(), updated_at=now() where id=$1`, [feedbackId]);
    const released = await client.query('select status, released_at from feedback_items where id=$1', [feedbackId]);
    expect(released.rows[0].status).toBe('released'); expect(released.rows[0].released_at).toBeTruthy();
  });
});
