// Pure helpers for the rule builder. No imports, so tests can load this file directly.

export interface Rule { trigger: number; condition: number; actions: number[] }

const TRIGGER_CODE = ['arrive_home', 'sunset', 'front_door.opened', 'outside.temp > 38'];
const CONDITION_CODE = ['after_dark', 'nobody_home', null];
const ACTION_CODE = ['gate.open()', 'lights.warm()', 'ac.set(24)', 'music.play("living room")'];

/** FNV-1a: stable 32-bit seed so the same rule always draws the same poster. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) seeded from the hash. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rule as the house would read it. Language-neutral on purpose. */
export function toCode(rule: Rule): string {
  const when = TRIGGER_CODE[rule.trigger] ?? TRIGGER_CODE[0];
  const cond = CONDITION_CODE[rule.condition];
  const head = cond ? `when ${when} and ${cond}:` : `when ${when}:`;
  const body = rule.actions.length ? rule.actions.map((a) => `  ${ACTION_CODE[a]}`).join('\n') : '  pass';
  return `${head}\n${body}`;
}

/** The rule as a sentence in the page language. */
export function toSentence(
  rule: Rule,
  words: { when: string; then: string; triggers: string[]; conditions: string[]; actions: string[] },
  comma = ', ',
): string {
  const acts = rule.actions.map((a) => words.actions[a]).join(comma);
  return `${words.when} ${words.triggers[rule.trigger]}${comma}${words.conditions[rule.condition]}${comma}${words.then} ${acts || '…'}`;
}
