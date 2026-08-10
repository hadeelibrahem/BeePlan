import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { aiTaskManagerNotifications } from '../db/schema';

describe('AI Task Manager notification migration', () => {
  const migrationTag = '0019_ai_task_manager_notifications';
  const migrationSql = readFileSync(
    join(process.cwd(), 'drizzle', `${migrationTag}.sql`),
    'utf8',
  );

  it('is journaled once as the latest effective migration', () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), 'drizzle', 'meta', '_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; when: number; tag: string }> };
    const matches = journal.entries.filter((entry) => entry.tag === migrationTag);

    expect(matches).toHaveLength(1);
    expect(matches[0].idx).toBe(journal.entries.length - 1);
    expect(matches[0].when).toBeGreaterThan(
      Math.max(...journal.entries.slice(0, -1).map((entry) => entry.when)),
    );
  });

  it('creates only the expected table, foreign keys, uniqueness, and indexes', () => {
    expect(migrationSql).toContain(
      'CREATE TABLE IF NOT EXISTS ai_task_manager_notifications',
    );
    expect(migrationSql).toContain(
      'task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE',
    );
    expect(migrationSql).toContain(
      'subtask_id uuid REFERENCES subtasks(id) ON DELETE CASCADE',
    );
    expect(migrationSql).toContain(
      'recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE',
    );
    expect(migrationSql).toContain(
      'fingerprint varchar(255) NOT NULL UNIQUE',
    );
    expect(migrationSql.match(/CREATE TABLE/gi)).toHaveLength(1);
    for (const index of [
      'idx_ai_tm_recipient_status',
      'idx_ai_tm_task',
      'idx_ai_tm_created',
      'idx_ai_tm_fingerprint',
    ]) {
      expect(migrationSql).toContain(`CREATE INDEX IF NOT EXISTS ${index}`);
    }
    expect(migrationSql).not.toMatch(/\bDROP\b/i);
  });

  it('matches the current Drizzle table and index names', () => {
    const config = getTableConfig(aiTaskManagerNotifications);

    expect(config.name).toBe('ai_task_manager_notifications');
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'task_id',
      'subtask_id',
      'recipient_user_id',
      'notification_type',
      'severity',
      'title',
      'summary',
      'explanation',
      'evidence',
      'confidence',
      'recommended_action',
      'fingerprint',
      'status',
      'read_at',
      'dismissed_at',
      'snoozed_until',
      'actioned_at',
      'expires_at',
      'created_at',
      'updated_at',
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      'idx_ai_tm_created',
      'idx_ai_tm_fingerprint',
      'idx_ai_tm_recipient_status',
      'idx_ai_tm_task',
    ]);
    expect(config.foreignKeys).toHaveLength(3);
  });
});
