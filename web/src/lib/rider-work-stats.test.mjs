// Run: npm test (from web/). Riders are salaried: the rider portal shows work stats (`rider:workStats`), never pay.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the rider data layer asks for rider:workStats and carries no money but the COD cash", () => {
  const src = read("./rider.ts");
  assert.match(src, /"rider:workStats"/);
  assert.doesNotMatch(src, /"rider:earnings"|earningsUsd|perTaskUsd|earningsToday/);
  const iface = src.slice(src.indexOf("export interface RiderWorkStats"), src.indexOf("export type RiderTaskStatus"));
  const usdFields = [...iface.matchAll(/(\w*Usd)\??:/g)].map((m) => m[1]);
  assert.deepEqual(usdFields, ["codCollectedUsd"]);
});

test("the My work page shows no pay, and the old /rider/earnings URL only redirects to /rider/work", () => {
  const work = read("../app/rider/work/page.tsx");
  assert.doesNotMatch(work, /earnings|perTask|per task|rate:/i);
  assert.match(work, /paid a salary by Somba&Teka\./);
  assert.match(work, /Vous êtes salarié de Somba&Teka\./);
  const old = read("../app/rider/earnings/page.tsx");
  assert.match(old, /redirect\("\/rider\/work"\)/);
  assert.doesNotMatch(old, /use client|useRiderData/);
});

test("nothing in the rider portal links to /rider/earnings any more", () => {
  const dir = new URL("../app/rider/", import.meta.url);
  const files = [];
  const walk = (u) => {
    for (const e of readdirSync(u, { withFileTypes: true })) {
      const next = new URL(e.name + (e.isDirectory() ? "/" : ""), u);
      if (e.isDirectory()) walk(next);
      else if (/\.tsx?$/.test(e.name)) files.push(next);
    }
  };
  walk(dir);
  for (const f of files) {
    if (f.pathname.endsWith("/earnings/page.tsx")) continue;
    assert.doesNotMatch(readFileSync(f, "utf8"), /rider\/earnings/, f.pathname);
  }
});

test("the rider nav and the dashboard use the My work / Completed today labels in English and French", () => {
  const i18n = read("./i18n.ts");
  assert.match(i18n, /myWork: "My work"/);
  assert.match(i18n, /myWork: "Mon travail"/);
  assert.match(i18n, /completedToday: "Completed today"/);
  assert.match(i18n, /completedToday: "Terminées aujourd'hui"/);
  assert.doesNotMatch(i18n, /^\s*earnings: /m);
  assert.match(read("../app/rider/layout.tsx"), /href: "\/rider\/work"[^}]*label: "myWork"/);
});
