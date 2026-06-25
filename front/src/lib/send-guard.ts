// front/src/lib/send-guard.ts
export const SEND_SOFT_LIMIT = 40;

// Key format: gp-sent-YYYY-MM-DD
function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `gp-sent-${y}-${m}-${d}`;
}

export function sentToday(now = new Date(), storage: Storage = localStorage): number {
  try {
    return Number(storage.getItem(todayKey(now))) || 0;
  } catch {
    return 0;
  }
}

export function recordSend(now = new Date(), storage: Storage = localStorage): number {
  try {
    const key = todayKey(now);
    const next = (Number(storage.getItem(key)) || 0) + 1;
    storage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function overSoftLimit(count: number): boolean {
  return count >= SEND_SOFT_LIMIT;
}
