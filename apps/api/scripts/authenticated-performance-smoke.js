const paths = [
  '/dashboard/today',
  '/reminders',
  '/focus/stats',
  '/focus/sessions/today',
  '/focus/recommendation',
  '/focus/queue',
  '/friends',
  '/friends/requests',
  '/location-sharing',
];

const baseUrl = (process.env.PERF_API_URL ?? 'http://127.0.0.1:3000').replace(
  /\/+$/,
  '',
);
const token = process.env.PERF_TEST_TOKEN;
const hardLimitMs = Number(process.env.PERF_HARD_LIMIT_MS ?? 15_000);
const targetMs = Number(process.env.PERF_TARGET_MS ?? 5_000);

if (!token) {
  console.error('PERF_TEST_TOKEN is required.');
  process.exit(2);
}

async function measure(path) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(hardLimitMs),
  });
  const durationMs = Date.now() - startedAt;
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  if (durationMs >= hardLimitMs) {
    throw new Error(`${path} exceeded ${hardLimitMs}ms`);
  }

  return {
    path,
    status: response.status,
    durationMs,
    target: durationMs < targetMs ? 'pass' : 'slow',
    contract: Array.isArray(body) ? 'array' : typeof body,
  };
}

Promise.all(paths.map(measure))
  .then((results) => {
    for (const result of results.sort((a, b) => b.durationMs - a.durationMs)) {
      console.log(JSON.stringify(result));
    }
    if (results.some((result) => result.durationMs >= hardLimitMs)) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
