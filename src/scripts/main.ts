import { state, update, bus, anyLight, ROOMS, type Room } from './home';
import { startLedger } from './ledger';
import type { Lang } from '../i18n';

const root = document.documentElement;
const lang = root.lang as Lang;
const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const $ = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = document) => scope.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = document) => [...scope.querySelectorAll<T>(sel)];

root.classList.add('rv');
startLedger();

/* ---------- Mode: full (3D) or text ---------- */

const canGL = (() => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
})();
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
const toggle = $<HTMLButtonElement>('[data-mode-toggle]');
type Stage = { stop(): void };
let stage: Stage | null = null;

async function setMode(mode: 'full' | 'text') {
  root.dataset.mode = mode;
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(mode === 'text'));
    toggle.textContent = mode === 'text' ? toggle.dataset.on! : toggle.dataset.off!;
  }
  if (mode === 'full' && !stage) {
    try {
      const { startStage } = await import('./gl/stage');
      stage = await startStage();
    } catch (err) {
      console.warn('3D stage unavailable, staying in text mode', err);
      root.dataset.mode = 'text';
    }
  } else if (mode === 'text' && stage) {
    stage.stop();
    stage = null;
  }
}
toggle?.addEventListener('click', () => setMode(root.dataset.mode === 'text' ? 'full' : 'text'));
setMode(canGL && !saveData ? 'full' : 'text');

/* ---------- Theme: the story's own day and night, or night throughout ---------- */

const themeBtn = $<HTMLButtonElement>('[data-theme-toggle]');
const setTheme = (dark: boolean, save = true) => {
  if (dark) root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  if (themeBtn) {
    const label = dark ? themeBtn.dataset.light! : themeBtn.dataset.dark!;
    themeBtn.setAttribute('aria-pressed', String(dark));
    $('[data-theme-label]', themeBtn)!.textContent = label;
  }
  // A per-visitor convenience only; the page works the same without it.
  if (save) try { localStorage.setItem('ark-theme', dark ? 'dark' : 'story'); } catch { /* private mode */ }
};
let savedTheme: string | null = null;
try { savedTheme = localStorage.getItem('ark-theme'); } catch { /* private mode */ }
setTheme(savedTheme === 'dark', false);
themeBtn?.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));

/* ---------- Header: steps aside while reading down, returns on the way up ---------- */

const bar = $('.bar');
if (bar) {
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (Math.abs(y - lastY) < 6) return;
    bar.classList.toggle('is-hidden', y > lastY && y > 160);
    lastY = y;
  }, { passive: true });
}

/* ---------- Gentle reveal ---------- */

// Only used where CSS scroll timelines are missing; there the focus pull plays once.
if (!CSS.supports('animation-timeline: view()')) {
  const reveal = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), reveal.unobserve(e.target))),
    { rootMargin: '0px 0px -12% 0px' },
  );
  $$('.w, .reveal').forEach((el) => reveal.observe(el));
}

/* ---------- Chapter rail ---------- */

const railLinks = $$<HTMLAnchorElement>('[data-rail]');
if (railLinks.length) {
  const rail = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) railLinks.forEach((a) => a.classList.toggle('on', a.dataset.rail === e.target.id));
    }),
    { rootMargin: '-50% 0px -50% 0px' },
  );
  railLinks.forEach((a) => { const s = document.getElementById(a.dataset.rail!); if (s) rail.observe(s); });
}

/* ---------- 03 Offline: cut the cloud ---------- */

const demo = $('[data-demo]');
if (demo) {
  const lights = $<HTMLButtonElement>('[data-lights]', demo)!;
  const cut = $<HTMLButtonElement>('[data-cut]', demo)!;
  const status = $('[data-status]', demo)!;
  const say = (text: string, tone = '') => { status.textContent = text; status.dataset.tone = tone; };
  const setAll = (on: boolean) => update((s) => ROOMS.forEach((r) => (s.lights[r] = on)));

  lights.addEventListener('click', (e) => {
    const target = !anyLight();
    if (state.cloud) {
      // shortcut: a fixed 0.7–1.3 s round trip stands in for a distant server; labelled "simulated" on screen.
      const ms = Math.round(700 + Math.random() * 600);
      lights.disabled = true;
      say(demo.dataset.waiting + '…');
      bus.dispatchEvent(new CustomEvent('cloud-trip', { detail: ms }));
      setTimeout(() => {
        setAll(target);
        lights.disabled = false;
        say(fill(demo.dataset.cloud!, { ms }));
      }, ms);
    } else {
      setAll(target);
      // Measured: from the tap to the next painted frame, on this device.
      requestAnimationFrame(() => say(fill(demo.dataset.local!, { ms: Math.max(1, Math.round(performance.now() - e.timeStamp)) }), 'local'));
    }
  });
  cut.addEventListener('click', () => {
    update((s) => (s.cloud = !s.cloud));
    cut.setAttribute('aria-pressed', String(!state.cloud));
    cut.textContent = state.cloud ? demo.dataset.cut! : demo.dataset.reconnect!;
    say(state.cloud ? '' : demo.dataset.after!);
  });
  bus.addEventListener('change', () => {
    const on = anyLight();
    lights.setAttribute('aria-pressed', String(on));
    $('.state', lights)!.textContent = on ? demo.dataset.on! : demo.dataset.off!;
  });
}

/* ---------- 04 Control: the phone ---------- */

const phone = $('[data-phone]');
if (phone) {
  const strings = JSON.parse($('#app-strings')!.textContent!) as Record<Lang, Record<string, string>>;
  let appLang: Lang = lang;
  const s = () => strings[appLang];
  const sheet = $('[data-sheet]', phone)!;

  const paint = () => {
    for (const r of ROOMS) {
      const btn = $(`[data-room="${r}"]`, phone)!;
      btn.setAttribute('aria-pressed', String(state.lights[r]));
      $('[data-state]', btn)!.textContent = state.lights[r] ? s().on : s().off;
    }
    const ac = $('[data-ac]', phone)!;
    ac.setAttribute('aria-pressed', String(state.ac));
    $('[data-state]', ac)!.textContent = state.ac ? `${s().on} · ${state.temp}°` : s().off;
    $('[data-temp-value]', phone)!.textContent = `${state.temp}°`;
    $('[data-gate-state]', phone)!.textContent = state.gate ? s().open : s().closed;
    $('[data-gate]', phone)!.textContent = state.gate ? s().closeAction : s().openAction;
  };
  const translate = () => {
    phone.lang = appLang;
    phone.dir = appLang === 'ar' ? 'rtl' : 'ltr';
    $$('[data-t]', phone).forEach((el) => {
      const value = el.dataset.t!.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], s());
      if (typeof value === 'string') el.textContent = value;
    });
    $$('[data-app-lang]', phone).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.appLang === appLang)));
    paint();
  };

  phone.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('button');
    if (!el) return;
    if (el.dataset.room) update((st) => (st.lights[el.dataset.room as Room] = !st.lights[el.dataset.room as Room]));
    else if ('ac' in el.dataset) update((st) => (st.ac = !st.ac));
    else if (el.dataset.temp) update((st) => (st.temp = Math.min(30, Math.max(16, st.temp + Number(el.dataset.temp)))));
    else if ('gate' in el.dataset) {
      // Opening asks first; closing never needs to.
      if (state.gate) update((st) => (st.gate = false));
      else { sheet.hidden = false; $<HTMLButtonElement>('[data-sheet-ok]', sheet)!.focus(); }
    } else if ('sheetOk' in el.dataset) { sheet.hidden = true; update((st) => (st.gate = true)); }
    else if ('sheetCancel' in el.dataset) sheet.hidden = true;
    else if (el.dataset.appLang) { appLang = el.dataset.appLang as Lang; translate(); }
    else if (el.dataset.scenePreset) {
      const preset = el.dataset.scenePreset;
      update((st) => {
        if (preset === 'arrive') { st.lights = { living: true, bedroom: false, kitchen: true, courtyard: true }; st.ac = true; st.temp = 24; }
        if (preset === 'night') { st.lights = { living: false, bedroom: true, kitchen: false, courtyard: false }; st.ac = true; st.temp = 26; st.gate = false; }
        if (preset === 'away') { st.lights = { living: false, bedroom: false, kitchen: false, courtyard: false }; st.ac = false; st.gate = false; }
      });
    }
  });
  sheet.addEventListener('keydown', (e) => e.key === 'Escape' && (sheet.hidden = true));
  bus.addEventListener('change', paint);
  paint();

  // The first time Control comes into view, the house comes home by itself,
  // unless the visitor has already been playing with it.
  let touched = false;
  document.addEventListener('click', (e) => { if ((e.target as Element).closest('[data-phone], [data-demo]')) touched = true; }, true);
  new IntersectionObserver((entries, obs) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    obs.disconnect();
    setTimeout(() => !touched && $<HTMLButtonElement>('[data-scene-preset="arrive"]', phone)?.click(), 900);
  }, { threshold: 0.4 }).observe(phone);
}

/* ---------- Footer: keep the site offline, only when asked ---------- */

const offlineBtn = $<HTMLButtonElement>('[data-offline]');
const offlineStatus = $('[data-offline-status]');
if (offlineBtn && offlineStatus) {
  const d = offlineBtn.dataset;
  const saved = (yes: boolean) => {
    offlineBtn.textContent = yes ? d.remove! : d.save!;
    offlineBtn.dataset.saved = String(yes);
    if (yes) offlineStatus.textContent = d.done!;
  };
  if (!('serviceWorker' in navigator)) offlineBtn.disabled = true;
  else {
    navigator.serviceWorker.getRegistration().then((reg) => saved(!!reg?.active));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'progress') offlineStatus.textContent = fill(d.progress!, { n: e.data.n, total: e.data.total });
      if (e.data?.type === 'done') saved(true);
      if (e.data?.type === 'failed') offlineStatus.textContent = d.fail!;
    });
    offlineBtn.addEventListener('click', async () => {
      try {
        if (offlineBtn.dataset.saved === 'true') {
          const reg = await navigator.serviceWorker.getRegistration();
          await reg?.unregister();
          await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
          saved(false);
          offlineStatus.textContent = '';
        } else {
          offlineBtn.disabled = true;
          const reg = await navigator.serviceWorker.register('/sw.js');
          const worker = reg.installing ?? reg.waiting ?? reg.active;
          if (reg.active && !reg.installing) saved(true);
          worker?.addEventListener('statechange', () => worker.state === 'activated' && saved(true));
        }
      } catch {
        offlineStatus.textContent = d.fail!;
      } finally {
        offlineBtn.disabled = false;
      }
    });
  }
}
