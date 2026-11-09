import test from 'node:test';
import assert from 'node:assert/strict';
import { UPPER, LOWER, inside, asciiMark } from '../../src/mark.ts';
import { hash, random, toCode, toSentence } from '../../src/scripts/rule.ts';
import { classify, kindOf, formatBytes } from '../../src/scripts/ledger-core.ts';
import { regionCoverage, normalise, nearest } from '../../src/scripts/gl/glyph-math.ts';

test('the mark is two halves, each the other turned 180° about the window centre', () => {
  UPPER.forEach(([x, y], i) => assert.deepEqual(LOWER[i], [4 - x, 3 - y]));
  assert.equal(inside(UPPER, 2, 0.5), true, 'top bar is solid');
  assert.equal(inside(LOWER, 1, 2.5), true, 'bottom bar is solid');
  assert.equal(inside(UPPER, 2, 1.5) || inside(LOWER, 2, 1.5), false, 'the window is open');
  assert.equal(inside(UPPER, 3.95, 0.05), false, 'the chamfered corner is cut');
});

test('the text-mode mark is written in the given word, row by row', () => {
  const art = asciiMark(40, 'ark');
  const lines = art.split('\n');
  assert.equal(lines.length, 15);
  assert.match(art, /^[ark\s]+$/);
  assert.ok(lines[7].includes('  '), 'the window shows as a gap in the middle rows');
});

test('the same rule always draws the same poster, a different rule a different one', () => {
  const a = toCode({ trigger: 0, condition: 0, actions: [0, 1] });
  const b = toCode({ trigger: 1, condition: 2, actions: [2] });
  assert.equal(hash(a), hash(a));
  assert.notEqual(hash(a), hash(b));
  const r1 = random(hash(a)), r2 = random(hash(a));
  assert.equal(r1(), r2());
  assert.equal(a, 'when arrive_home and after_dark:\n  gate.open()\n  lights.warm()');
  assert.equal(b, 'when sunset:\n  ac.set(24)');
  assert.equal(toCode({ trigger: 0, condition: 2, actions: [] }), 'when arrive_home:\n  pass');
});

test('the rule reads as a sentence in the page language', () => {
  const words = { when: 'When', then: 'then', triggers: ['I arrive home'], conditions: ['if it is after dark'], actions: ['open the gate', 'warm lights'] };
  assert.equal(toSentence({ trigger: 0, condition: 0, actions: [0, 1] }, words), 'When I arrive home, if it is after dark, then open the gate, warm lights');
  assert.equal(toSentence({ trigger: 0, condition: 0, actions: [0] }, words, '، '), 'When I arrive home، if it is after dark، then open the gate');
});

test('the ledger counts every other company, and only bytes from this site', () => {
  const origin = 'https://ark.example';
  const { rows, thirdParty, bytes, byKind } = classify([
    { name: 'https://ark.example/', initiatorType: 'navigation', transferSize: 1000 },
    { name: 'https://ark.example/_astro/a.js', initiatorType: 'script', transferSize: 500 },
    { name: 'https://ark.example/_astro/f.woff2', initiatorType: 'css', transferSize: 0, encodedBodySize: 300 },
    { name: 'https://tracker.example/pixel.gif', initiatorType: 'img', transferSize: 43 },
    { name: 'data:image/png;base64,AAAA', initiatorType: 'img' },
  ], origin);
  assert.equal(rows.length, 4, 'data: URLs are not requests');
  assert.equal(thirdParty, 1);
  assert.equal(bytes, 1800, 'cached files still count by size, other companies do not count');
  assert.deepEqual(byKind, { page: 1000, script: 500, font: 300 });
  assert.equal(kindOf({ name: 'https://x/y.css?v=1', initiatorType: 'link' }), 'style');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.00 MB');
});

test('glyph shape vectors measure ink per region and pick the closest letter', () => {
  // 4×6 cell, left half inked.
  const alpha = Array.from({ length: 24 }, (_, i) => (i % 4 < 2 ? 255 : 0));
  assert.deepEqual(regionCoverage(alpha, 4, 6), [1, 0, 1, 0, 1, 0]);
  const vectors = normalise([[0, 0, 0, 0, 0, 0], [0.5, 0, 0.5, 0, 0.5, 0], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]]);
  assert.deepEqual(vectors[2], [1, 1, 1, 1, 1, 1]);
  assert.equal(nearest(vectors, [0, 0, 0, 0, 0, 0]), 0, 'darkness is a space');
  assert.equal(nearest(vectors, [1, 0, 1, 0.1, 1, 0]), 1, 'a left edge picks the left-heavy glyph');
  assert.equal(nearest(vectors, [0.9, 1, 1, 0.9, 1, 1]), 2, 'brightness picks the dense glyph');
});
