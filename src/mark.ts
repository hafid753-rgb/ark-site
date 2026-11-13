// The Ark mark, measured from the app icon: two identical chamfered L shapes,
// each the other turned 180°, locking around a 2:1 window. Units: bar width = 1,
// whole mark 4 × 3, y pointing down (SVG convention).
export type Point = readonly [number, number];

const C = 0.83; // chamfer leg length

/** Upper piece: top bar + right bar, chamfered top-right corner. */
export const UPPER: readonly Point[] = [
  [1, 0], [4 - C, 0], [4, C], [4, 2], [3, 2], [3, 1], [1, 1],
];

/** Lower piece: the upper piece turned 180° about the window centre (2, 1.5). */
export const LOWER: readonly Point[] = UPPER.map(([x, y]) => [4 - x, 3 - y] as Point);

export const WIDTH = 4;
export const HEIGHT = 3;

export const toPath = (pts: readonly Point[], s = 1) =>
  'M' + pts.map(([x, y]) => `${+(x * s).toFixed(3)} ${+(y * s).toFixed(3)}`).join('L') + 'Z';

/** Even-odd point-in-polygon test, used to rasterise the mark into text. */
export function inside(pts: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The mark drawn in characters. `glyphs` fills the shape in reading order,
 * so the mark is literally written in the word it stands for.
 */
export function asciiMark(cols: number, glyphs: string, aspect = 0.5): string {
  const rows = Math.round(cols * (HEIGHT / WIDTH) * aspect);
  const chars = [...glyphs];
  let n = 0;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols) * WIDTH;
      const y = ((r + 0.5) / rows) * HEIGHT;
      line += inside(UPPER, x, y) || inside(LOWER, x, y) ? chars[n++ % chars.length] : ' ';
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
