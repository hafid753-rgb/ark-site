import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { copy } from '../../src/i18n.ts';

const shape = (v, path = '') =>
  Array.isArray(v) ? [`${path}[${v.length}]`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))]
  : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k))
  : [path];
const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const BANNED = /jellyfin|home ?assistant|homeassistant/i;

test('French and Arabic have exactly the keys English has', () => {
  const en = shape(copy.en);
  assert.deepEqual(shape(copy.fr), en);
  assert.deepEqual(shape(copy.ar), en);
});

test('no empty strings, no names the owner asked to keep off the site', () => {
  for (const [lang, c] of Object.entries(copy)) {
    for (const s of strings(c)) {
      assert.ok(s.trim().length > 0, `${lang}: empty string`);
      assert.doesNotMatch(s, BANNED, `${lang}: "${s}"`);
    }
  }
});

test('headlines carry no final period (unslop)', () => {
  for (const [lang, c] of Object.entries(copy)) {
    for (const key of ['hero', 'rented', 'yours', 'offline', 'control', 'cinema', 'setup', 'start']) {
      assert.doesNotMatch(c[key].title, /\.$/, `${lang}.${key}.title`);
    }
  }
});

test('the built site never mentions the banned names (when dist exists)', { skip: !existsSync('dist') }, () => {
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk('dist').filter((f) => /\.(html|js|css)$/.test(f))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), BANNED, f);
  }
});
