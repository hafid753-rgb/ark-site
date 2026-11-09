import { hash, random } from './rule';

const W = 1080;
const H = 1350;

/** Draws the rule as a ring poster: same rule, same poster, made on this device. */
export async function drawPoster(canvas: HTMLCanvasElement, sentence: string, code: string, actions: number, glyphs: string) {
  const rtl = document.documentElement.dir === 'rtl';
  const sans = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim();
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();
  await Promise.all([document.fonts.load(`500 44px ${sans}`, sentence), document.fonts.load(`400 22px ${mono}`)]).catch(() => {});

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rand = random(hash(code));
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // Rings, slightly irregular like the ones in the Adrar.
  const cx = W / 2, cy = 560;
  const rings = 10 + actions * 2;
  const chars = [...glyphs];
  for (let i = 0; i < rings; i++) {
    const r = 52 + i * 30;
    const p1 = rand() * Math.PI * 2, p2 = rand() * Math.PI * 2;
    const a1 = 0.02 + rand() * 0.05, a2 = 0.01 + rand() * 0.03;
    const accent = i % Math.max(2, Math.floor(rings / Math.max(actions, 1))) === 1 && i > 1;
    ctx.beginPath();
    for (let s = 0; s <= 240; s++) {
      const th = (s / 240) * Math.PI * 2;
      const k = 1 + a1 * Math.sin(3 * th + p1) + a2 * Math.sin(5 * th + p2);
      const x = cx + Math.cos(th) * r * k * 1.08, y = cy + Math.sin(th) * r * k;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.lineWidth = accent ? 3 : 1.5;
    ctx.strokeStyle = accent ? '#2997ff' : `rgba(245,245,247,${0.5 - (i / rings) * 0.38})`;
    ctx.stroke();

    // Every third ring is written in the word, letter by letter.
    if (i % 3 === 2) {
      ctx.fillStyle = 'rgba(245,245,247,0.55)';
      ctx.font = `400 18px ${mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const n = Math.floor((r * 2 * Math.PI) / 26);
      for (let j = 0; j < n; j++) {
        const th = (j / n) * Math.PI * 2 + p1;
        const k = 1 + a1 * Math.sin(3 * th + p1) + a2 * Math.sin(5 * th + p2);
        ctx.save();
        ctx.translate(cx + Math.cos(th) * (r * k * 1.08 + 14), cy + Math.sin(th) * (r * k + 14));
        ctx.rotate(th + Math.PI / 2);
        ctx.fillText(chars[j % chars.length], 0, 0);
        ctx.restore();
      }
    }
  }

  // The window at the centre: the mark's 2:1 opening.
  ctx.strokeStyle = '#f5f5f7';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 44, cy - 22, 88, 44);

  // The rule, in the reader's language.
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5f5f7';
  ctx.font = `500 44px ${sans}`;
  const x = rtl ? W - 80 : 80;
  let y = 1040;
  for (const line of wrap(ctx, sentence, W - 160).slice(0, 4)) {
    ctx.fillText(line, x, y);
    y += 56;
  }
  ctx.font = `400 22px ${mono}`;
  ctx.fillStyle = '#86868b';
  ctx.direction = 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.fillText(`Ark · ${new Date().toISOString().slice(0, 10)}`, x, H - 72);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
