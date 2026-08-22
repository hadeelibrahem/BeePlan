import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ErrorFingerprintService {
  normalize(value: string) {
    return value
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ':uuid')
      .replace(/\b\d{4}-\d\d-\d\d[T ][^\s]+/g, ':timestamp')
      .replace(/\b(?:req(?:uest)?[_ -]?id|trace[_ -]?id)[=:]\s*[\w-]+/gi, ':request')
      .replace(/0x[0-9a-f]+/gi, ':address')
      .replace(/\b\d{3,}\b/g, ':id')
      .replace(/\s+/g, ' ').trim().slice(0, 1000);
  }
  fingerprint(input: { environment: string; service: string; operation?: string; route?: string; errorClass: string; message: string; stack?: string }) {
    const stableStack = (input.stack ?? '').split('\n').slice(0, 4).map((line) => this.normalize(line)).join('\n');
    return createHash('sha256').update([input.environment, input.service, input.operation ?? input.route ?? '', input.errorClass, this.normalize(input.message), stableStack].join('|')).digest('hex');
  }
}
