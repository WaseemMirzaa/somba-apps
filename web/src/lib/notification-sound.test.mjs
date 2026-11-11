// Run: npm test (from web/). Transpiles notification-sound.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./notification-sound.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);
const { createThrottle, readSoundEnabled, writeSoundEnabled, shouldChimeForNotice, shouldChimeForChat, isViewingConversation, SOUND_KEY } = m;

const NOW = Date.parse("2026-11-11T12:00:00Z");
const fresh = (over = {}) => ({ id: "n1", read: false, createdAt: new Date(NOW - 1000).toISOString(), type: "order", entityId: "o1", ...over });
const memStore = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)), data };
};

/** Every notice type the API sends: the page links and the service's own types, read from the API sources. */
function apiNoticeTypes() {
  const links = readFileSync(new URL("../../../api/src/notifications/links.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../../../api/src/notifications/notifications.service.ts", import.meta.url), "utf8");
  const found = new Set(["task", "marketing", "chat", "system"]);
  for (const x of links.matchAll(/t === '([a-z_]+)'/g)) found.add(x[1]);
  for (const x of service.matchAll(/type: '([a-z_]+)'/g)) found.add(x[1]);
  return found;
}

test("throttle: one chime per 2 seconds", () => {
  let t = 1000;
  const allow = createThrottle(2000, () => t);
  assert.equal(allow(), true);
  t += 1999;
  assert.equal(allow(), false);
  t += 1;
  assert.equal(allow(), true);
  t += 100;
  assert.equal(allow(), false);
});

test("sound switch: on by default, saved per browser, storage errors never throw", () => {
  const st = memStore();
  assert.equal(readSoundEnabled(st), true);
  writeSoundEnabled(false, st);
  assert.equal(st.data[SOUND_KEY], "off");
  assert.equal(readSoundEnabled(st), false);
  writeSoundEnabled(true, st);
  assert.equal(readSoundEnabled(st), true);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readSoundEnabled(broken), true);
  assert.doesNotThrow(() => writeSoundEnabled(false, broken));
});

test("every notice type the API sends is routed to the sound", () => {
  const types = apiNoticeTypes();
  assert.ok(types.size > 20, `read ${types.size} types`);
  for (const t of ["order", "payment", "delivery", "return", "dispute", "support", "campaign", "chat", "task", "stock", "fraud"]) assert.ok(types.has(t), t);
  for (const t of types) {
    assert.equal(shouldChimeForNotice(fresh({ type: t }), { knownIds: new Set(), now: NOW }), true, t);
  }
});

test("a notice is silent when it is history, already read, a replay, or an update of a known one", () => {
  const ctx = { knownIds: new Set(["n1"]), now: NOW };
  assert.equal(shouldChimeForNotice(fresh(), ctx), false, "already loaded");
  assert.equal(shouldChimeForNotice(fresh({ id: "n2", read: true }), { knownIds: new Set(), now: NOW }), false, "read");
  assert.equal(shouldChimeForNotice(fresh({ id: "n3", createdAt: new Date(NOW - 10 * 60_000).toISOString() }), { knownIds: new Set(), now: NOW }), false, "old");
  assert.equal(shouldChimeForNotice({}, { knownIds: new Set(), now: NOW }), false, "malformed");
});

test("a chat notice is silent only while that conversation is open in the visible tab", () => {
  const n = fresh({ id: "c1", type: "chat", entityId: "conv9" });
  const open = { pathname: "/shop/messages/conv9", visible: true };
  assert.equal(shouldChimeForNotice(n, { knownIds: new Set(), now: NOW, viewing: open }), false);
  assert.equal(shouldChimeForNotice(n, { knownIds: new Set(), now: NOW, viewing: { ...open, visible: false } }), true);
  assert.equal(shouldChimeForNotice(n, { knownIds: new Set(), now: NOW, viewing: { pathname: "/shop/orders", visible: true } }), true);
  assert.equal(isViewingConversation("/seller/messages/conv9", "conv9", true), true);
});

test("chat messages: not your own, not the open thread", () => {
  assert.equal(shouldChimeForChat({ senderId: "me", conversationId: "c" }, { userId: "me" }), false);
  assert.equal(shouldChimeForChat({ senderId: "them", conversationId: "c" }, { userId: "me" }), true);
  assert.equal(shouldChimeForChat({ senderId: "them", conversationId: "c" }, { userId: "me", viewing: { pathname: "/shop/messages/c", visible: true } }), false);
});
