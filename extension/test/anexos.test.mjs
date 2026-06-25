import { test } from "node:test";
import assert from "node:assert/strict";
import { uidFromToken, leadPrefix, humanSize } from "../src/lib/anexos.mjs";

function tokenFor(sub) {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `h.${payload}.s`;
}

test("uidFromToken tira o sub do JWT (base64url)", () => {
  assert.equal(uidFromToken(tokenFor("user-123")), "user-123");
  assert.equal(uidFromToken(""), null);
  assert.equal(uidFromToken("lixo"), null);
  assert.equal(uidFromToken(null), null);
});

test("leadPrefix monta <uid>/<leadId> so quando logado", () => {
  assert.equal(leadPrefix({ accessToken: tokenFor("u1") }, "lead9"), "u1/lead9");
  assert.equal(leadPrefix({ accessToken: "" }, "lead9"), null);
  assert.equal(leadPrefix({}, "lead9"), null);
});

test("humanSize formata bytes", () => {
  assert.equal(humanSize(0), "");
  assert.equal(humanSize(512), "512 B");
  assert.equal(humanSize(2048), "2 KB");
  assert.equal(humanSize(5 * 1024 * 1024), "5 MB");
});
