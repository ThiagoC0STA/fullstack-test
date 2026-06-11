import { Injectable } from "@nestjs/common";

/**
 * Satisfies each service's ClockPort structurally. The domains keep
 * their own port definitions; this is just the production adapter.
 */
@Injectable()
export class SystemClock {
  now(): Date {
    return new Date();
  }
}
