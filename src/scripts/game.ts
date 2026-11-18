/**
 * A small platform game at the end of the page: a pixel man in a blue boubou and turban walks the
 * dunes and jumps under three "?" boxes; each gives one word: You / deserve / sovereignty.
 * 256 x 120 logical pixels, scaled up crisp. Runs only while on screen.
 */
const W = 256, H = 120, GROUND = 100, BOX = 16;

// The player, 12 x 17, one letter per pixel. T turban, t turban shade, S skin, s shade, E eye,
// B boubou blue, b boubou fold, W white shirt, F sandals.
const BODY = [
  '....TTTT....',
  '...TTTTTT...',
  '...TtttttT..',
  '...SSSSSS...',
  '...SSESSE...',
  '...SSSSSS...',
  '....tttt....',
  '..BBBWWBBB..',
  '.BBBBWWBBBB.',
  'BBBBBWWBBBBB',
  'BbBBBBBBBBbB',
  'SbBBBBBBBBbS',
  '.bBBBBBBBBb.',
  '.BBBBBBBBBB.',
  '..BBBBBBBB..',
];
const STAND = ['...FF..FF...', '...FF..FF...'];
const WALK = [['..FF....FF..', '.FF......FF.'], ['....FFFF....', '....FFFF....']];
const QMARK = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];

type Box = { x: number; y: number; word: string; hit: boolean; bump: number; rise: number };

export function start(section: HTMLElement) {
  const canvas = section.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const done = section.querySelector<HTMLElement>('.play-done')!;
  const again = section.querySelector<HTMLButtonElement>('.play-again')!;
  const rtl = document.documentElement.dir === 'rtl';
  const words: string[] = JSON.parse(section.dataset.words || '[]');
  const font = getComputedStyle(document.body).fontFamily;
  section.hidden = false;

  let boxes: Box[] = [], px = 0, py = 0, vx = 0, vy = 0, ground = true, face = 1, step = 0, got = 0, t = 0;
  const reset = () => {
    // In Arabic the sentence reads from the right: the first word sits in the rightmost box.
    const xs = [56, 120, 184];
    boxes = words.map((word, i) => ({ x: xs[rtl ? 2 - i : i], y: GROUND - 52, word, hit: false, bump: 0, rise: 0 }));
    px = rtl ? W - 28 : 16; py = GROUND - 17; vx = vy = 0; face = rtl ? -1 : 1; got = 0;
    done.textContent = '';
    again.hidden = true;
  };
  reset();

  // Sparse blue mosaic in the sky, fixed: the same pixel squares as the rest of the site.
  const tiles = Array.from({ length: 26 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % 70, s: 2 + (i % 3) * 2, c: i % 3 }));

  const keys = { left: false, right: false, jump: false };
  const set = (k: string, on: boolean) => {
    if (k === 'ArrowLeft' || k === 'left') keys.left = on;
    else if (k === 'ArrowRight' || k === 'right') keys.right = on;
    else if (k === ' ' || k === 'ArrowUp' || k === 'jump') keys.jump = on;
    else return false;
    return true;
  };
  // Keys only while the game has focus, so the page still scrolls with space everywhere else.
  canvas.addEventListener('keydown', (e) => { if (set(e.key, true)) e.preventDefault(); });
  canvas.addEventListener('keyup', (e) => set(e.key, false));
  canvas.addEventListener('pointerdown', () => { canvas.focus(); keys.jump = true; setTimeout(() => (keys.jump = false), 120); });
  section.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) => {
    const k = b.dataset.key!;
    const on = (e: Event) => { e.preventDefault(); set(k, true); };
    const off = () => set(k, false);
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, off));
  });
  again.addEventListener('click', () => { reset(); canvas.focus(); });

  const colors = () => {
    const cs = getComputedStyle(document.documentElement);
    const night = document.documentElement.dataset.theme === 'dark';
    return {
      ink: cs.getPropertyValue('--text').trim() || '#0e2439',
      sky: night ? ['#0a2a4a', '#0d3a66', '#12508c'] : ['#bfe3ff', '#7cc8ff', '#2997ff'],
      sand: night ? '#2a2f3a' : '#e9dcc3', sandDark: night ? '#1d222b' : '#d6c3a0',
      box: '#0071e3', boxEdge: '#004f9e', used: night ? '#3a4656' : '#c8d2de',
    };
  };
  const pal = (c: ReturnType<typeof colors>): Record<string, string> => ({
    T: '#f4f6fa', t: '#c9d6e3', S: '#7a4a2c', s: '#5c3620', E: '#0e1620', B: '#2f8fe8', b: '#1f6fc0', W: '#f4f6fa', F: c.ink,
  });
  const sprite = (rows: string[], x: number, y: number, p: Record<string, string>, flip: boolean) => {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[flip ? row.length - 1 - i : i];
        if (ch === '.') continue;
        ctx.fillStyle = p[ch] ?? ch;
        ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
      }
    });
  };

  const hitBox = (b: Box) => {
    b.bump = 4;
    if (b.hit) return;
    b.hit = true;
    got++;
    if (got === boxes.length) {
      done.textContent = words.join(' ') + '.';
      again.hidden = false;
    }
  };

  const tick = () => {
    t++;
    // Walk, with a little run-up; jump from the ground.
    const want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    vx += (want * 1.6 - vx) * 0.25;
    if (want) face = want;
    if (keys.jump && ground) { vy = -4.3; ground = false; }
    vy = Math.min(vy + 0.24, 5);

    // Move one axis at a time against the boxes (solid) and the ground.
    px = Math.max(0, Math.min(W - 12, px + vx));
    for (const b of boxes) {
      const by = b.y - b.bump;
      if (px + 12 > b.x && px < b.x + BOX && py + 17 > by && py < by + BOX) px = vx > 0 ? b.x - 12 : b.x + BOX;
    }
    py += vy;
    ground = false;
    for (const b of boxes) {
      if (px + 12 <= b.x + 1 || px >= b.x + BOX - 1) continue;
      if (vy < 0 && py < b.y + BOX && py > b.y + BOX - 8) { py = b.y + BOX; vy = 0.6; hitBox(b); }
      else if (vy >= 0 && py + 17 > b.y && py + 17 < b.y + 8) { py = b.y - 17; vy = 0; ground = true; }
    }
    if (py >= GROUND - 17) { py = GROUND - 17; vy = 0; ground = true; }
    step = ground && Math.abs(vx) > 0.3 ? step + Math.abs(vx) * 0.12 : 0;
    for (const b of boxes) { b.bump *= 0.7; if (b.hit) b.rise = Math.min(1, b.rise + 0.06); }
  };

  const draw = () => {
    const c = colors(), p = pal(c);
    ctx.clearRect(0, 0, W, H);
    for (const m of tiles) { ctx.fillStyle = c.sky[m.c]; ctx.globalAlpha = 0.55; ctx.fillRect(m.x, m.y, m.s, m.s); }
    ctx.globalAlpha = 1;
    // The ground: a long low dune, then sand.
    ctx.fillStyle = c.sandDark;
    for (let x = 0; x < W; x++) ctx.fillRect(x, GROUND - 2 + Math.round(Math.sin(x * 0.05) * 1.5), 1, 3);
    ctx.fillStyle = c.sand;
    ctx.fillRect(0, GROUND + 1, W, H - GROUND);
    ctx.fillStyle = c.sandDark;
    for (let x = 3; x < W; x += 11) ctx.fillRect(x, GROUND + 6 + ((x * 7) % 9), 2, 1);

    for (const b of boxes) {
      const y = Math.round(b.y - b.bump);
      ctx.fillStyle = b.hit ? c.used : c.boxEdge;
      ctx.fillRect(b.x, y, BOX, BOX);
      ctx.fillStyle = b.hit ? c.used : c.box;
      ctx.fillRect(b.x + 1, y + 1, BOX - 2, BOX - 2);
      if (!b.hit) {
        const glint = Math.floor(t / 20) % 6 === 0 ? '#bfe3ff' : '#ffffff';
        QMARK.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { ctx.fillStyle = glint; ctx.fillRect(b.x + 6 + i, y + 4 + j, 1, 1); } }));
      }
      if (b.rise > 0) {
        // The word rises out of the box and stays above it.
        ctx.globalAlpha = b.rise;
        ctx.fillStyle = c.ink;
        ctx.font = `700 9px ${font}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.word, b.x + BOX / 2, b.y - 6 - b.rise * 8);
        ctx.globalAlpha = 1;
      }
    }

    const walking = step > 0;
    const frame = walking ? Math.floor(step) % 2 : 0;
    sprite(BODY, px, py, p, face < 0);
    sprite(walking ? WALK[frame] : STAND, px, py + 15, p, face < 0);
  };

  let raf = 0, visible = false, last = 0, acc = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    acc = Math.min(acc + (now - (last || now)), 100);
    last = now;
    while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; }
    draw();
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { last = 0; raf = requestAnimationFrame(loop); }
    if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; keys.left = keys.right = keys.jump = false; }
  }).observe(canvas);
  draw();
}
