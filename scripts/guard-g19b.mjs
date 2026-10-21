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
for (const key of keys(en)) {
  const at = (obj) => key.split(".").reduce((value, part) => value[part], obj);
  const placeholders = (text) => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(placeholders(at(en)), placeholders(at(fr)), `Interpolation mismatch: ${key}`);
}
console.log(`G19b PASS: ${keys(en).length} matching EN/FR keys`);
