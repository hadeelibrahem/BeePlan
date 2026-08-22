import { Injectable } from '@nestjs/common';

export type RuntimeEntry = {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  lastErrorCategory: string | null;
};

const empty = (): RuntimeEntry => ({
  lastStartedAt: null,
  lastFinishedAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastDurationMs: null,
  consecutiveFailures: 0,
  lastErrorCategory: null,
});
const workers = new Map<string, RuntimeEntry>();
const providers = new Map<string, RuntimeEntry>();

@Injectable()
export class RuntimeTelemetryRegistry {
  private static start(store: Map<string, RuntimeEntry>, id: string) {
    const value = store.get(id) ?? empty();
    value.lastStartedAt = new Date().toISOString();
    store.set(id, value);
  }
  private static finish(
    store: Map<string, RuntimeEntry>,
    id: string,
    success: boolean,
    durationMs: number,
    category?: string,
  ) {
    const value = store.get(id) ?? empty();
    const now = new Date().toISOString();
    value.lastFinishedAt = now;
    value.lastDurationMs = Math.max(0, Math.round(durationMs));
    if (success) {
      value.lastSuccessAt = now;
      value.consecutiveFailures = 0;
      value.lastErrorCategory = null;
    } else {
      value.lastFailureAt = now;
      value.consecutiveFailures += 1;
      value.lastErrorCategory = category ?? 'unknown_runtime_error';
    }
    store.set(id, value);
  }
  workerStarted(id: string) {
    RuntimeTelemetryRegistry.start(workers, id);
  }
  workerSucceeded(id: string, durationMs: number) {
    RuntimeTelemetryRegistry.finish(workers, id, true, durationMs);
  }
  workerFailed(id: string, category: string, durationMs: number) {
    RuntimeTelemetryRegistry.finish(workers, id, false, durationMs, category);
  }
  providerStarted(id: string) {
    RuntimeTelemetryRegistry.start(providers, id);
  }
  providerSucceeded(id: string, durationMs: number) {
    RuntimeTelemetryRegistry.finish(providers, id, true, durationMs);
  }
  providerFailed(id: string, category: string, durationMs: number) {
    RuntimeTelemetryRegistry.finish(providers, id, false, durationMs, category);
  }
  worker(id: string) {
    return workers.get(id);
  }
  provider(id: string) {
    return providers.get(id);
  }
}

export const runtimeTelemetry = new RuntimeTelemetryRegistry();
