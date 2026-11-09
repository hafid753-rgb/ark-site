import { classify, formatBytes, type Entry } from './ledger-core';

const KINDS = ['page', 'style', 'script', 'font', 'image', 'data', 'other'];

/** Keeps the proof chapter and the hero counter in sync with what the browser actually fetched. */
export function startLedger() {
  const list = document.querySelector<HTMLOListElement>('[data-ledger]');
  const rings = document.querySelector<SVGSVGElement>('[data-rings]');
  const set = (sel: string, v: string) => document.querySelectorAll(sel).forEach((el) => (el.textContent = v));

  const render = () => {
    const entries = [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ] as unknown as Entry[];
    const { rows, thirdParty, bytes, byKind } = classify(entries, location.origin);
    const cookies = document.cookie ? document.cookie.split(';').filter(Boolean).length : 0;
    set('[data-third-party], [data-stat="third"], [data-stat="trackers"]', String(thirdParty));
    set('[data-stat="cookies"]', String(cookies));
    set('[data-stat="bytes"]', formatBytes(bytes));

    if (list) {
      list.replaceChildren(
        ...rows.map((r) => {
          const li = document.createElement('li');
          if (r.own) li.className = 'own';
          li.append(span(r.path), span(r.kind), span(r.bytes ? formatBytes(r.bytes) : 'cache'));
          return li;
        }),
      );
    }
    if (rings) drawRings(rings, byKind, thirdParty);
  };

  render();
  try {
    new PerformanceObserver(render).observe({ type: 'resource', buffered: true });
  } catch {
    setInterval(render, 4000);
  }
}

function span(text: string) {
  const s = document.createElement('span');
  s.textContent = text;
  return s;
}

/** One ring per kind of file, its arc the share of bytes. The outer dashed ring is everyone else: empty. */
function drawRings(svg: SVGSVGElement, byKind: Record<string, number>, thirdParty: number) {
  const total = Object.values(byKind).reduce((a, b) => a + b, 0) || 1;
  const ns = 'http://www.w3.org/2000/svg';
  const parts: SVGElement[] = [];
  KINDS.forEach((kind, i) => {
    const r = 22 + i * 10;
    const c = 2 * Math.PI * r;
    const share = (byKind[kind] ?? 0) / total;
    const base = document.createElementNS(ns, 'circle');
    base.setAttribute('r', String(r));
    base.setAttribute('fill', 'none');
    base.setAttribute('stroke', 'rgba(245,245,247,0.08)');
    base.setAttribute('stroke-width', '4');
    parts.push(base);
    if (share > 0) {
      const arc = document.createElementNS(ns, 'circle');
      arc.setAttribute('r', String(r));
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', i === 0 ? '#2997ff' : `rgba(245,245,247,${0.85 - i * 0.08})`);
      arc.setAttribute('stroke-width', '4');
      arc.setAttribute('stroke-dasharray', `${Math.max(share * c, 1.5)} ${c}`);
      arc.setAttribute('transform', 'rotate(-90)');
      parts.push(arc);
    }
  });
  const outer = document.createElementNS(ns, 'circle');
  outer.setAttribute('r', '96');
  outer.setAttribute('fill', 'none');
  outer.setAttribute('stroke', thirdParty ? '#e5484d' : 'rgba(245,245,247,0.25)');
  outer.setAttribute('stroke-dasharray', '2 6');
  parts.push(outer);
  const label = document.createElementNS(ns, 'text');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'central');
  label.setAttribute('fill', '#f5f5f7');
  label.setAttribute('font-family', 'IBM Plex Mono, monospace');
  label.setAttribute('font-size', '14');
  label.textContent = String(thirdParty);
  parts.push(label);
  svg.replaceChildren(...parts);
}
