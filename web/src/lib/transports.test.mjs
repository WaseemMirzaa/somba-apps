// Run: npm test (from web/). The socket client must not be websocket-only: a network that refuses the upgrade would leave
// the shop with no connection at all (product pages stuck on "Loading…"). The behaviour against a server whose proxy drops
// the upgrade is covered by api/src/realtime/socket-transport-fallback.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const load = (rel) => {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
};
const { SOCKET_TRANSPORT_OPTIONS } = await import("data:text/javascript;base64," + Buffer.from(load("./realtime/transports.ts")).toString("base64"));

test("polling is allowed, so a refused websocket upgrade does not cut the shop off", () => {
  assert.ok(SOCKET_TRANSPORT_OPTIONS.transports.includes("polling"));
  assert.ok(SOCKET_TRANSPORT_OPTIONS.transports.includes("websocket"));
});

test("it starts on polling and upgrades, never the other way round (an upgrade probe cannot hang the first connection)", () => {
  assert.equal(SOCKET_TRANSPORT_OPTIONS.transports[0], "polling");
  assert.equal(SOCKET_TRANSPORT_OPTIONS.upgrade, true);
  assert.equal(SOCKET_TRANSPORT_OPTIONS.rememberUpgrade, true);
});

test("the socket client takes its transports from that one place", () => {
  const client = readFileSync(new URL("./realtime/socket-client.ts", import.meta.url), "utf8");
  assert.match(client, /SOCKET_TRANSPORT_OPTIONS/);
  assert.doesNotMatch(client, /transports:\s*\["websocket"\]/);
});
