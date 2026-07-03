#!/usr/bin/env node
/**
 * Safe cleanup for legacy reminder normalization tables.
 *
 * Background: an earlier version of BeePlan modeled reminders with
 * separate `reminder_checklist_items`, `reminder_locations`, and
 * `reminder_recurrence` tables. The current schema (see
 * apps/api/src/db/schema.ts -> `reminders`) stores that same data as
 * jsonb columns (`checklist_items`, `location`, `repeat_*`) directly on
 * the `reminders` row instead. Nothing in the codebase reads or writes
 * the three legacy tables anymore (verified via full-repo grep), and as
 * of this writing they contain zero rows in the dev database.
 *
 * This script does NOT delete anything blindly. It re-checks the row
 * counts itself right before dropping, and refuses to touch a table
 * that has any rows -- if that happens, it aborts with no changes so a
 * human can inspect the data first.
 *
 * Usage:
 *   node apps/api/scripts/cleanup-legacy-reminder-tables.js           # dry run (default)
 *   node apps/api/scripts/cleanup-legacy-reminder-tables.js --apply   # actually drop if empty
 */
require('dotenv').config();
const { Client } = require('pg');

const LEGACY_TABLES = ['reminder_checklist_items', 'reminder_locations', 'reminder_recurrence'];

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    const counts = {};
    for (const table of LEGACY_TABLES) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      counts[table] = rows[0].count;
    }

    console.log('Legacy reminder table row counts:');
    for (const table of LEGACY_TABLES) {
      console.log(`  ${table}: ${counts[table]}`);
    }

    const nonEmpty = LEGACY_TABLES.filter((table) => counts[table] > 0);
    if (nonEmpty.length > 0) {
      console.error(
        `\nAborting: ${nonEmpty.join(', ')} still contain data. Not dropping anything. ` +
          'Investigate and migrate that data before re-running this script.',
      );
      process.exitCode = 1;
      return;
    }

    if (!apply) {
      console.log('\nAll three tables are empty and unreferenced by application code.');
      console.log('Dry run only - re-run with --apply to drop them.');
      return;
    }

    await client.query('BEGIN');
    for (const table of LEGACY_TABLES) {
      await client.query(`DROP TABLE IF EXISTS ${table}`);
      console.log(`Dropped ${table}`);
    }
    await client.query('COMMIT');
    console.log('\nDone.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Cleanup script failed:', error);
  process.exitCode = 1;
});
