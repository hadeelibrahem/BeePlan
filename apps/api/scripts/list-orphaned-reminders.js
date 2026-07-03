#!/usr/bin/env node
/**
 * Admin tool for reminders with no owning user (`user_id IS NULL`).
 *
 * These rows predate JWT auth being required on reminder creation, so
 * there is no reliable way to auto-detect who they belong to. This
 * script never deletes or bulk-modifies anything - it only reports, and
 * optionally reassigns ONE reminder at a time to a user you specify
 * explicitly after reviewing its content.
 *
 * Usage:
 *   node apps/api/scripts/list-orphaned-reminders.js
 *     List every orphaned reminder with its content, for manual review.
 *
 *   node apps/api/scripts/list-orphaned-reminders.js --reassign <reminderId> --email <userEmail>
 *     Set that single reminder's user_id to the given user's id. Fails
 *     loudly if the reminder already has an owner or the email doesn't
 *     match exactly one user.
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const args = process.argv.slice(2);
  const reassignIndex = args.indexOf('--reassign');
  const emailIndex = args.indexOf('--email');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    if (reassignIndex !== -1 && emailIndex !== -1) {
      const reminderId = args[reassignIndex + 1];
      const email = args[emailIndex + 1];
      if (!reminderId || !email) {
        console.error('Usage: --reassign <reminderId> --email <userEmail>');
        process.exitCode = 1;
        return;
      }

      const { rows: users } = await client.query('select id, email from users where email = $1', [email]);
      if (users.length !== 1) {
        console.error(`Expected exactly one user with email ${email}, found ${users.length}. Aborting.`);
        process.exitCode = 1;
        return;
      }

      const { rows: reminderRows } = await client.query(
        'select id, title, user_id from reminders where id = $1',
        [reminderId],
      );
      if (reminderRows.length !== 1) {
        console.error(`No reminder found with id ${reminderId}.`);
        process.exitCode = 1;
        return;
      }
      if (reminderRows[0].user_id !== null) {
        console.error(`Reminder ${reminderId} already has an owner (user_id=${reminderRows[0].user_id}). Refusing to overwrite.`);
        process.exitCode = 1;
        return;
      }

      await client.query('update reminders set user_id = $1, is_orphaned = false where id = $2', [
        users[0].id,
        reminderId,
      ]);
      console.log(`Reassigned reminder "${reminderRows[0].title}" (${reminderId}) to ${email}.`);
      return;
    }

    const { rows } = await client.query(
      `select id, title, status, priority, type, notes, created_at
       from reminders
       where user_id is null
       order by created_at`,
    );

    if (rows.length === 0) {
      console.log('No orphaned reminders found.');
      return;
    }

    console.log(`${rows.length} orphaned reminder(s) (no owning user):\n`);
    for (const row of rows) {
      console.log(`- ${row.id}`);
      console.log(`  title: ${row.title}`);
      console.log(`  status: ${row.status}, priority: ${row.priority}, type: ${row.type}`);
      console.log(`  created: ${row.created_at.toISOString()}`);
      if (row.notes) console.log(`  notes: ${row.notes}`);
      console.log('');
    }
    console.log(
      'These are hidden from every user of the app (all reminder queries filter by user_id) and are\n' +
        'not deleted. To assign one to its rightful owner:\n' +
        '  node apps/api/scripts/list-orphaned-reminders.js --reassign <id> --email <userEmail>',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exitCode = 1;
});
