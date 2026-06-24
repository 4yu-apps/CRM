import { test } from "node:test";
import assert from "node:assert/strict";
import { makeQuota } from "../src/lib/wa-quota.mjs";

function fakeStorage() {
  const mem = {};
  return {
    async get(keys) {
      const ks = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of ks) if (k in mem) out[k] = mem[k];
      return out;
    },
    async set(patch) { Object.assign(mem, patch); },
  };
}

test("respeita o teto diario", async () => {
  const storage = fakeStorage();
  const now = () => Date.parse("2026-06-24T10:00:00Z");
  const q = makeQuota({ storage, now, cap: 2 });
  assert.equal(await q.canCheck(), true);
  await q.record(); await q.record();
  assert.equal(await q.canCheck(), false);
  assert.equal(await q.remaining(), 0);
});

test("reseta na virada do dia", async () => {
  const storage = fakeStorage();
  let t = Date.parse("2026-06-24T23:59:00Z");
  const q = makeQuota({ storage, now: () => t, cap: 1 });
  await q.record();
  assert.equal(await q.canCheck(), false);
  t = Date.parse("2026-06-25T00:01:00Z");
  assert.equal(await q.canCheck(), true);
});
