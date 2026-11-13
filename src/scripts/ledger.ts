import { classify, type Entry } from './ledger-core';

/** Keeps the hero's counter in sync with what the browser actually fetched from other companies. */
export function startLedger() {
  const render = () => {
    const entries = [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ] as unknown as Entry[];
    const { thirdParty } = classify(entries, location.origin);
    document.querySelectorAll('[data-third-party]').forEach((el) => (el.textContent = String(thirdParty)));
  };
  render();
  try {
    new PerformanceObserver(render).observe({ type: 'resource', buffered: true });
  } catch {
    setInterval(render, 4000);
  }
}
