/**
 * Fixed-step accumulator: converts variable frame time into whole sim ticks plus an
 * interpolation alpha for smooth rendering (CORE-1). Pure, so it is unit-tested without a browser.
 */
export class FixedStepper {
  private acc = 0;
  private readonly stepMs: number;
  private readonly maxTicksPerFrame: number;

  /** `maxTicksPerFrame` caps catch-up so a stalled tab does not trigger a spiral. */
  constructor(ticksPerSecond: number, maxTicksPerFrame = 5) {
    this.stepMs = 1000 / ticksPerSecond;
    this.maxTicksPerFrame = maxTicksPerFrame;
  }

  /** Returns how many ticks to run now; leftover time carries over. */
  advance(deltaMs: number): number {
    this.acc += Math.max(0, deltaMs);
    let ticks = Math.floor(this.acc / this.stepMs);
    if (ticks > this.maxTicksPerFrame) {
      ticks = this.maxTicksPerFrame;
      this.acc = 0; // drop the backlog
    } else {
      this.acc -= ticks * this.stepMs;
    }
    return ticks;
  }

  /** 0..1 progress between the last tick and the next, for render interpolation. */
  get alpha(): number {
    return this.acc / this.stepMs;
  }
}
