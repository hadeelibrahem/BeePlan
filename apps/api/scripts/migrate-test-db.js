const { spawnSync } = require('node:child_process');
const testUrl = process.env.TEST_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required; refusing to use DATABASE_URL.');
if (devUrl && testUrl === devUrl) throw new Error('TEST_DATABASE_URL must never equal DATABASE_URL.');
const parsed = new URL(testUrl);
if (!/^beeplan_test($|_)/i.test(parsed.pathname.replace(/^\//, ''))) throw new Error('Refusing to migrate a database not named beeplan_test (or beeplan_test_*).');
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['drizzle-kit', 'migrate', '--config=drizzle.config.ts'], { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, DATABASE_URL: testUrl } });
process.exit(result.status ?? 1);
