import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const keys = (o, p = "") =>
  Object.entries(o)
    .flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]))
    .sort();
const read = (lang) =>
  JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url)));
const en = read("en"),
  fr = read("fr");
assert.deepEqual(keys(en), keys(fr));
console.log(`G19b PASS: ${keys(en).length} matching EN/FR keys`);
