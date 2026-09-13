/**
 * Stage F — median filter and octave correction. docs/AUDIO_PIPELINE.md §3 Stage F.
 *
 * Runs on the main thread over the incoming PitchFrame stream:
 *   1. unvoiced → gap marker; the window persists across short gaps
 *   2. take the median of the current window
 *   3. a value within `band` of 2× or 0.5× that median is corrected toward it
 *      rather than discarded, which preserves frame count for timing
 *   4. otherwise accept and push
 *
 * Output is the median after the push, so this stage costs roughly half the
 * window in latency — the dominant tunable term in the §7 budget.
 *
 * Known limitation: a deliberate octave leap is damped. v1 exercises are
 * stepwise by design (REQUIREMENTS §7), so this does not arise.
 */
export class MedianOctaveFilter {
  private readonly buf: Float64Array;
  private readonly scratch: Float64Array;
  private count = 0;
  private idx = 0;

  /** How often step 3 fired — surfaced for tuning, not used in scoring. */
  corrections = 0;
  pushes = 0;

  private readonly size: number;
  private readonly band: number;

  constructor(size: number, band = 0.03) {
    this.size = size;
    this.band = band;
    this.buf = new Float64Array(size);
    this.scratch = new Float64Array(size);
  }

  reset(): void {
    this.count = 0;
    this.idx = 0;
    this.corrections = 0;
    this.pushes = 0;
  }

  median(): number | null {
    const n = this.count;
    if (n === 0) return null;
    const s = this.scratch;
    for (let i = 0; i < n; i++) s[i] = this.buf[i];
    for (let i = 1; i < n; i++) {          // insertion sort; n is 3–9
      const v = s[i];
      let j = i - 1;
      while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; }
      s[j + 1] = v;
    }
    return n & 1 ? s[(n - 1) >> 1] : (s[(n >> 1) - 1] + s[n >> 1]) / 2;
  }

  /** @param hz voiced frequency, or null for an unvoiced frame. */
  push(hz: number | null): number | null {
    if (hz == null) return null;          // step 1 — window untouched
    let v = hz;
    const med = this.median();
    if (med != null) {                    // steps 2–3
      const r = v / med;
      if (Math.abs(r - 2) <= 2 * this.band) { v /= 2; this.corrections++; }
      else if (Math.abs(r - 0.5) <= 0.5 * this.band) { v *= 2; this.corrections++; }
    }
    this.buf[this.idx] = v;               // step 4
    this.idx = (this.idx + 1) % this.size;
    if (this.count < this.size) this.count++;
    this.pushes++;
    return this.median();
  }
}
