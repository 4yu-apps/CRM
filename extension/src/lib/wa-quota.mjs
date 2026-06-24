// Cota diaria de checagens de WhatsApp, anti-ban. Espelha o padrao da cota do Maps.
export const SWEEP_DAILY_CAP = 150;
export const SWEEP_MIN_INTERVAL_MS = 4000;

const PREFIX = "wa-check-";

function dayKey(ms) {
  return PREFIX + new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function makeQuota({ storage, now, cap } = {}) {
  const store = storage ?? chrome.storage.local;
  const clock = now ?? (() => Date.now());
  const limit = cap ?? SWEEP_DAILY_CAP;

  async function count() {
    const key = dayKey(clock());
    const got = await store.get(key);
    return Number(got?.[key] ?? 0);
  }
  return {
    async canCheck() { return (await count()) < limit; },
    async remaining() { return Math.max(0, limit - (await count())); },
    async record() {
      const key = dayKey(clock());
      const c = await count();
      await store.set({ [key]: c + 1 });
    },
  };
}
