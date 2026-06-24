import { test } from "node:test";
import assert from "node:assert/strict";
import { noWhatsappFields, undoFields } from "../src/lib/repo.mjs";

test("noWhatsappFields arquiva e adiciona a tag sem duplicar", () => {
  const f = noWhatsappFields({ tags: ["frio"] }, "2026-06-24T10:00:00.000Z");
  assert.equal(f.archived, true);
  assert.deepEqual(f.tags, ["frio", "sem-whatsapp"]);
  assert.equal(f.whatsapp_checked_at, "2026-06-24T10:00:00.000Z");
});

test("noWhatsappFields nao duplica a tag nem quebra com tags nulo", () => {
  assert.deepEqual(noWhatsappFields({ tags: ["sem-whatsapp"] }, "x").tags, ["sem-whatsapp"]);
  assert.deepEqual(noWhatsappFields({ tags: null }, "x").tags, ["sem-whatsapp"]);
});

test("undoFields remove a tag, desarquiva e zera o checked", () => {
  const f = undoFields({ tags: ["sem-whatsapp", "frio"], archived: true });
  assert.equal(f.archived, false);
  assert.deepEqual(f.tags, ["frio"]);
  assert.equal(f.whatsapp_checked_at, null);
});
