import { Global, Module } from '@nestjs/common';
import { RuntimeTelemetryRegistry, runtimeTelemetry } from './runtime-telemetry.registry';

/** Application-scoped runtime health state shared by workers and Admin System Health. */
@Global()
@Module({
  providers: [{ provide: RuntimeTelemetryRegistry, useValue: runtimeTelemetry }],
  exports: [RuntimeTelemetryRegistry],
})
export class RuntimeTelemetryModule {}
