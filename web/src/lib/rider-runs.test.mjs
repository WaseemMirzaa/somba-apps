// Run: npm test (from web/). Transpiles rider-runs.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./rider-runs.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const r = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const raw = (o = {}) => ({
  id: "run1",
  reference: "TR-0001",
  fromHubId: "k",
  fromHubName: "Entrepôt Kinshasa",
  toHubId: "l",
  toHubName: "Entrepôt Limete",
  riderId: "me",
  riderName: "Jean Rider",
  status: "dispatched",
  taskIds: ["t1", "t2"],
  count: 2,
  receivedCount: 0,
  missingCount: 0,
  inTransit: false,
  ...o,
});
const run = (o) => r.parseRun(raw(o));

test("a run payload is read like the rider app reads it", () => {
  const x = run();
  assert.deepEqual([x.id, x.reference, x.toHubName, x.fromHubName, x.status, x.count, x.receivedCount, x.missingCount, x.inTransit], ["run1", "TR-0001", "Entrepôt Limete", "Entrepôt Kinshasa", "dispatched", 2, 0, 0, false]);
  assert.equal(r.parseRun({ reference: "TR-1" }), null); // no id
  assert.equal(r.parseRun(null), null);
  // the count falls back to the parcel ids; an unknown status reads as planned; the road as a status reads as dispatched, on the road
  assert.equal(run({ count: undefined }).count, 2);
  assert.equal(run({ status: "weird" }).status, "planned");
  assert.deepEqual([run({ status: "in_transit", inTransit: undefined }).status, run({ status: "in_transit", inTransit: undefined }).inTransit], ["dispatched", true]);
  assert.equal(run({ inTransit: undefined, inTransitAt: "2026-10-26T10:00:00Z" }).inTransit, true); // an older payload that only has the time
  assert.equal(run({ inTransit: undefined }).inTransit, false);
});

test("rider:runs replies as a list or as { runs }, and skips what has no id", () => {
  assert.equal(r.parseRuns([raw(), { nope: 1 }, raw({ id: "run2" })]).length, 2);
  assert.equal(r.parseRuns({ runs: [raw()] }).length, 1);
  assert.deepEqual(r.parseRuns(null), []);
  assert.deepEqual(r.parseRuns("x"), []);
});

test("a run is the driver's job until it is closed or every parcel is scanned in", () => {
  assert.equal(r.isActiveRun(run({ status: "planned" })), true);
  assert.equal(r.isActiveRun(run({ status: "dispatched" })), true);
  assert.equal(r.isActiveRun(run({ status: "arrived", receivedCount: 1 })), true); // part of it is in
  assert.equal(r.isActiveRun(run({ status: "arrived", receivedCount: 2 })), false); // arrived and every parcel received: done
  assert.equal(r.isActiveRun(run({ status: "arrived", receivedCount: 3 })), false);
  assert.equal(r.isActiveRun(run({ status: "closed" })), false);
  assert.equal(r.isActiveRun(run({ status: "closed", receivedCount: 0 })), false);
  // a run with no parcels is never "all received"
  assert.equal(r.allReceived(run({ count: 0, taskIds: [], receivedCount: 0 })), false);
  assert.equal(r.allReceived(run({ receivedCount: 2 })), true);
});

test("run:updated adds a run of this driver, updates it in place, and drops one that is not theirs (any more)", () => {
  let list = [];
  list = r.applyRunPush(list, raw(), "me");
  assert.deepEqual(list.map((x) => x.id), ["run1"]);
  list = r.applyRunPush(list, raw({ id: "run2", reference: "TR-0002" }), "me");
  assert.deepEqual(list.map((x) => x.id), ["run2", "run1"]); // new ones go first
  list = r.applyRunPush(list, raw({ status: "arrived", receivedCount: 1 }), "me");
  assert.deepEqual(list.map((x) => [x.id, x.status, x.receivedCount]), [["run2", "dispatched", 0], ["run1", "arrived", 1]]);
  // another driver's run never appears
  assert.equal(r.applyRunPush(list, raw({ id: "run3", riderId: "other" }), "me").length, 2);
  // reassigned to somebody else: it leaves
  assert.deepEqual(r.applyRunPush(list, raw({ riderId: "other" }), "me").map((x) => x.id), ["run2"]);
  // a run with no driver is not theirs; a malformed push changes nothing
  assert.equal(r.applyRunPush(list, raw({ id: "run4", riderId: null }), "me").length, 2);
  assert.equal(r.applyRunPush(list, { oops: true }, "me"), list);
  assert.equal(r.applyRunPush(list, null, "me"), list);
});

test("the read keeps the runs of this driver, and a payload without a driver", () => {
  const all = r.parseRuns([raw({ id: "a" }), raw({ id: "b", riderId: "other" }), raw({ id: "c", riderId: null })]);
  assert.deepEqual(r.mineOnly(all, "me").map((x) => x.id), ["a", "c"]);
});

test("parcels inside a known run are not tasks of their own", () => {
  const tasks = [
    { id: "t1", runId: "run1", status: "in_transit" },
    { id: "t2", runId: null, status: "assigned" }, // listed by the run's taskIds only
    { id: "t3", runId: null, status: "assigned" },
    { id: "t4", runId: "run-unknown", status: "assigned" }, // a run the driver does not have: stays a task
  ];
  const runs = [run(), run({ id: "run9", taskIds: [] })];
  assert.deepEqual(r.parcelsOfRun(runs[0], tasks).map((t) => t.id), ["t1", "t2"]);
  assert.equal(r.inKnownRun(tasks[0], runs), true);
  assert.equal(r.inKnownRun(tasks[3], runs), false);
  assert.equal(r.inKnownRun({ runId: null }, runs), false);
  assert.deepEqual(r.looseTasks(tasks, runs).map((t) => t.id), ["t2", "t3", "t4"]); // t2 is only known by taskIds: runId decides, as in the app
  assert.deepEqual(r.looseTasks(tasks, []).map((t) => t.id), ["t1", "t2", "t3", "t4"]); // no runs known: everything is a task
});

test("on the road: the server says so, the driver said so, or every parcel is in transit", () => {
  const planned = run({ status: "dispatched" });
  assert.equal(r.runOnRoad(planned, [{ status: "picked_up" }]), false);
  assert.equal(r.runOnRoad(run({ inTransit: true }), []), true);
  assert.equal(r.runOnRoad(planned, [], new Set(["run1"])), true);
  assert.equal(r.runOnRoad(planned, [{ status: "in_transit" }, { status: "in_transit" }]), true);
  assert.equal(r.runOnRoad(planned, [{ status: "in_transit" }, { status: "picked_up" }]), false);
  assert.equal(r.runOnRoad(planned, []), false);
});

test("the status badge and what the list filter sees", () => {
  assert.equal(r.runBadge(run({ status: "planned" }), false), "planned");
  assert.equal(r.runBadge(run({ status: "dispatched" }), false), "loaded");
  assert.equal(r.runBadge(run({ status: "dispatched" }), true), "onRoad");
  assert.equal(r.runBadge(run({ status: "arrived" }), true), "arrived");
  assert.equal(r.runBadge(run({ status: "closed" }), true), "closed");
  assert.deepEqual(["planned", "loaded", "onRoad", "arrived", "closed"].map(r.runTaskStatus), ["assigned", "picked_up", "in_transit", "delivered", "delivered"]);
  assert.deepEqual(["planned", "loaded", "onRoad", "arrived", "closed"].map(r.runBadgeVariant), ["default", "warning", "primary", "success", "success"]);
  assert.deepEqual(["planned", "loaded", "onRoad", "arrived", "closed"].map((b) => r.runBadgeText(b, false)), ["Being prepared", "Loaded", "On the road", "Handed over", "Closed"]);
  assert.deepEqual(["planned", "loaded", "onRoad", "arrived", "closed"].map((b) => r.runBadgeText(b, true)), ["En préparation", "Chargée", "En route", "Remise", "Clôturée"]);
});

test("the card's lines, in both languages", () => {
  assert.equal(r.runTitleText("Entrepôt Limete", 4, false), "Transfer to Entrepôt Limete · 4 parcels");
  assert.equal(r.runTitleText("Entrepôt Limete", 4, true), "Transfert vers Entrepôt Limete · 4 colis");
  assert.equal(r.runTitleText("Entrepôt Limete", 1, false), "Transfer to Entrepôt Limete · 1 parcel");
  assert.equal(r.runTitleText("Entrepôt Limete", 1, true), "Transfert vers Entrepôt Limete · 1 colis");
  assert.equal(r.runTitleText(null, 2, true), "Transfert vers l’entrepôt · 2 colis");
  assert.equal(r.runWord("kind_run", false), "Transfer run");
  assert.equal(r.runWord("kind_run", true), "Tournée de transfert");
  assert.equal(r.runWord("leg_transfer_from", true, { name: "Entrepôt Kinshasa" }), "Depuis Entrepôt Kinshasa");
  assert.equal(r.runWord("leg_transfer_from", false, { name: "Entrepôt Kinshasa" }), "From Entrepôt Kinshasa");
  assert.equal(r.runWord("run_parcels", true, { n: 3 }), "Colis (3)");
  assert.equal(r.runWord("done_run_on_road", true), "La tournée est en route. Bonne route !");
  assert.equal(r.runHopText({ hop: 1, hops: 2 }, "Entrepôt Limete", "Entrepôt Kinshasa", false), "Hop 1/2 · Entrepôt Limete → Entrepôt Kinshasa");
  assert.equal(r.runHopText({ hop: 2, hops: 2 }, "Entrepôt Kinshasa", "Entrepôt Kikwit", true), "Étape 2/2 · Entrepôt Kinshasa → Entrepôt Kikwit");
});

test("parcels scanned in: the French reads singular up to one, like the app", () => {
  assert.equal(r.runReceivedText(1, 1, true), "1 colis sur 1 réceptionné");
  assert.equal(r.runReceivedText(1, 4, true), "1 colis sur 4 réceptionné");
  assert.equal(r.runReceivedText(0, 4, true), "0 colis sur 4 réceptionné");
  assert.equal(r.runReceivedText(2, 4, true), "2 colis sur 4 réceptionnés");
  assert.equal(r.runReceivedText(4, 4, true), "4 colis sur 4 réceptionnés");
  assert.equal(r.runReceivedText(1, 1, false), "1 of 1 parcels scanned in");
  assert.equal(r.runReceivedText(2, 4, false), "2 of 4 parcels scanned in");
});

test("missing parcels are flagged, singular and plural", () => {
  assert.equal(r.runMissingText(1, false), "1 parcel missing from this run");
  assert.equal(r.runMissingText(1, true), "1 colis manquant dans cette tournée");
  assert.equal(r.runMissingText(2, false), "2 parcels missing from this run");
  assert.equal(r.runMissingText(2, true), "2 colis manquants dans cette tournée");
});

test("the hand-over box: hand over, waiting for the scan, then handed over once every parcel is in", () => {
  const to = "Entrepôt Limete";
  // loaded, not on the road yet: the title only
  assert.deepEqual(r.handoverText(run({ status: "dispatched" }), false, false), { title: `Hand over at ${to}`, hint: null });
  // on the road: waiting for the warehouse to scan it in
  assert.deepEqual(r.handoverText(run({ status: "dispatched" }), true, false), { title: `Hand over at ${to}`, hint: "Waiting for the warehouse to scan it in" });
  assert.deepEqual(r.handoverText(run({ status: "dispatched" }), true, true), { title: `À remettre à ${to}`, hint: "En attente du scan par l’entrepôt" });
  // arrived, part of it scanned in: still waiting
  assert.equal(r.handoverText(run({ status: "arrived", receivedCount: 1 }), false, false).hint, "Waiting for the warehouse to scan it in");
  // every parcel in: handed over, the run is done
  assert.deepEqual(r.handoverText(run({ status: "arrived", receivedCount: 2 }), true, false), { title: `Handed over at ${to}`, hint: "Every parcel was scanned in. This run is done." });
  assert.deepEqual(r.handoverText(run({ status: "arrived", receivedCount: 2 }), true, true), { title: `Remis à ${to}`, hint: "Tous les colis ont été réceptionnés. Cette tournée est terminée." });
  // no name: "the warehouse"
  assert.equal(r.handoverText(run({ toHubName: null }), false, true).title, "À remettre à l’entrepôt");
});

test("which parts of the card show", () => {
  const planned = run({ status: "planned" });
  assert.equal(r.showsHandover(planned), false); // the warehouse is still loading
  assert.equal(r.showsHandover(run({ status: "dispatched" })), true);
  assert.equal(r.showsHandover(run({ status: "arrived", receivedCount: 1 })), true);
  assert.equal(r.showsHandover(run({ status: "closed", receivedCount: 2 })), true); // closed with everything in: handed over
  assert.equal(r.showsHandover(run({ status: "closed", receivedCount: 1, missingCount: 1 })), false); // closed with a parcel missing: no "every parcel was scanned in"
  assert.equal(r.showsReceived(run({ status: "dispatched", receivedCount: 0 })), false);
  assert.equal(r.showsReceived(run({ status: "dispatched", receivedCount: 1 })), true);
  assert.equal(r.showsReceived(run({ status: "arrived" })), true);
  assert.equal(r.showsReceived(run({ status: "closed" })), true);
});

test("a hop of a multi-hop route comes from the run, else from its parcels", () => {
  assert.equal(r.runHop(run(), [{ hop: 1, hops: 1 }]), null);
  assert.deepEqual(r.runHop(run({ hop: 2, hops: 3 }), []), { hop: 2, hops: 3 });
  assert.equal(r.runHop(run({ hop: 1, hops: 1 }), []), null);
  assert.deepEqual(r.runHop(run(), [{ hop: 1, hops: 1 }, { hop: 2, hops: 2 }]), { hop: 2, hops: 2 });
});

// The words are the rider app's own: compare every pair with rider-app/lib/l10n/messages.dart (skipped when the app is not checked out).
const dart = new URL("../../../rider-app/lib/l10n/messages.dart", import.meta.url);
test("every word is the same text as in the Flutter rider app", { skip: !existsSync(dart) && "rider-app is not in this checkout" }, () => {
  const file = readFileSync(dart, "utf8");
  const unq = (s) => s.replace(/\\'/g, "'").replace(/\\n/g, "\n");
  const pair = (key) => {
    const m = new RegExp(`'${key}':\\s*\\(\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*\\)`).exec(file);
    return m ? [unq(m[1]), unq(m[2])] : null;
  };
  const keys = Object.keys(r.RUN_WORDS);
  assert.ok(keys.length >= 20);
  for (const key of keys) {
    const flutter = pair(key);
    assert.ok(flutter, `${key} is missing in messages.dart`);
    assert.deepEqual([...r.RUN_WORDS[key]], flutter, key);
  }
});
