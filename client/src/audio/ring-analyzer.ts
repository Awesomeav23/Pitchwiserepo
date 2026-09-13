/**
 * Stage A — ring buffer accumulation. docs/AUDIO_PIPELINE.md §3 Stage A.
 *
 * process() is handed a fixed 128-sample render quantum, which is 2.67 ms at
 * 48 kHz and far too short to resolve the period of a low note. Quanta are
 * accumulated into overlapping analysis windows.
 *
 * Allocates only in the constructor. takeFrame() returns a reused array, and
 * window boundaries are tracked by absolute sample index so successive frames
 * are exactly hopSize apart regardless of block size.
 */
export class RingAnalyzer {
  private readonly ring: Float32Array;
  private readonly mask: number;
  /** Reused every hop — never reallocated. */
  readonly frame: Float32Array;

  private total = 0;
  private nextEnd: number;
  /** Absolute index one past the end of the most recent frame. */
  frameEnd = 0;

  readonly windowSize: number;
  readonly hopSize: number;

  constructor(windowSize: number, hopSize: number) {
    this.windowSize = windowSize;
    this.hopSize = hopSize;
    let cap = 1;
    while (cap < windowSize + hopSize) cap <<= 1;  // power of two → mask, no modulo
    this.ring = new Float32Array(cap);
    this.mask = cap - 1;
    this.frame = new Float32Array(windowSize);
    this.nextEnd = windowSize;
  }

  reset(): void {
    this.total = 0;
    this.nextEnd = this.windowSize;
    this.frameEnd = 0;
    this.ring.fill(0);
  }

  push(block: Float32Array): void {
    const { ring, mask } = this;
    const w = this.total;
    for (let i = 0; i < block.length; i++) ring[(w + i) & mask] = block[i];
    this.total = w + block.length;
  }

  /** Absolute number of samples pushed since the last reset. */
  get totalSamples(): number {
    return this.total;
  }

  hasFrame(): boolean {
    return this.total >= this.nextEnd;
  }

  takeFrame(): Float32Array {
    const { windowSize: W, ring, mask, frame } = this;
    const start = this.nextEnd - W;
    for (let i = 0; i < W; i++) frame[i] = ring[(start + i) & mask];
    this.frameEnd = this.nextEnd;
    this.nextEnd += this.hopSize;
    return frame;
  }
}

/** Stage B — linear RMS. Not dB: §3 Stage B avoids a log on every frame. */
export function rms(buf: Float32Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / n);
}
