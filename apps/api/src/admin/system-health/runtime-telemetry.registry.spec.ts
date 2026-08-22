import { RuntimeTelemetryRegistry } from './runtime-telemetry.registry';

describe('RuntimeTelemetryRegistry', () => {
  it('tracks success, duration, safe failures, and recovery', () => {
    const registry = new RuntimeTelemetryRegistry();
    expect(registry.worker('telemetry-test')).toBeUndefined();
    registry.workerStarted('telemetry-test');
    registry.workerFailed('telemetry-test', 'timeout', 12.7);
    expect(registry.worker('telemetry-test')).toMatchObject({
      consecutiveFailures: 1,
      lastDurationMs: 13,
      lastErrorCategory: 'timeout',
    });
    registry.workerStarted('telemetry-test');
    registry.workerSucceeded('telemetry-test', 4);
    expect(registry.worker('telemetry-test')).toMatchObject({
      consecutiveFailures: 0,
      lastDurationMs: 4,
      lastErrorCategory: null,
    });
    expect(JSON.stringify(registry.worker('telemetry-test'))).not.toContain(
      'password',
    );
  });

  it('keeps provider telemetry separate from worker telemetry', () => {
    const registry = new RuntimeTelemetryRegistry();
    registry.providerStarted('provider-test');
    registry.providerFailed('provider-test', 'rate_limited', 3);
    expect(registry.provider('provider-test')?.lastErrorCategory).toBe(
      'rate_limited',
    );
    expect(registry.worker('provider-test')).toBeUndefined();
  });
});
