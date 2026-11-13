// Pure classification of the browser's resource timing entries. No imports.

export interface Entry { name: string; initiatorType: string; transferSize?: number; encodedBodySize?: number }
export interface Row { path: string; kind: string; bytes: number; own: boolean }

const KIND: Record<string, string> = {
  navigation: 'page', script: 'script', link: 'style', css: 'style', img: 'image',
  fetch: 'data', xmlhttprequest: 'data', other: 'other',
};

export function kindOf(e: Entry): string {
  const ext = e.name.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) return 'font';
  if (['js', 'mjs'].includes(ext)) return 'script';
  if (ext === 'css') return 'style';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif', 'gif'].includes(ext)) return 'image';
  return KIND[e.initiatorType] ?? 'other';
}

/** Splits entries into rows; `own` is false for anything not from this site's origin. */
export function classify(entries: Entry[], origin: string) {
  const rows: Row[] = [];
  for (const e of entries) {
    let url: URL;
    try { url = new URL(e.name); } catch { continue; }
    if (url.protocol === 'data:' || url.protocol === 'blob:') continue;
    const own = url.origin === origin;
    rows.push({
      path: own ? url.pathname + url.search : url.href,
      kind: kindOf(e),
      bytes: Math.max(e.transferSize ?? 0, e.encodedBodySize ?? 0),
      own,
    });
  }
  const thirdParty = rows.filter((r) => !r.own).length;
  const bytes = rows.reduce((s, r) => s + (r.own ? r.bytes : 0), 0);
  const byKind: Record<string, number> = {};
  for (const r of rows) if (r.own) byKind[r.kind] = (byKind[r.kind] ?? 0) + r.bytes;
  return { rows, thirdParty, bytes, byKind };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
