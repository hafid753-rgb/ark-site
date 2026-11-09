// Pure maths behind the glyph renderer. No imports, so tests can load it directly.

/**
 * How much ink a glyph puts in each of six regions of its cell
 * (2 columns × 3 rows, read top-left to bottom-right), 0..1.
 * Matching on shape instead of a single brightness value keeps edges sharp.
 */
export function regionCoverage(alpha: ArrayLike<number>, w: number, h: number, stride = 1, offset = 0): number[] {
  const sums = [0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const ry = Math.min(2, Math.floor((y / h) * 3));
    for (let x = 0; x < w; x++) {
      const rx = x < w / 2 ? 0 : 1;
      const k = ry * 2 + rx;
      sums[k] += alpha[(y * w + x) * stride + offset] / 255;
      counts[k]++;
    }
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
}

/** Scales all vectors so the densest region of any glyph reads as 1. */
export function normalise(vectors: number[][]): number[][] {
  const max = Math.max(1e-6, ...vectors.flat());
  return vectors.map((v) => v.map((x) => x / max));
}

/** Reference for the shader's matching step: nearest glyph by squared distance. */
export function nearest(vectors: number[][], sample: number[]): number {
  let best = 0;
  let bestD = Infinity;
  vectors.forEach((v, i) => {
    const d = v.reduce((s, x, k) => s + (x - sample[k]) ** 2, 0);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
