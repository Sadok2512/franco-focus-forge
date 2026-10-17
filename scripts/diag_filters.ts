// Diag 1.17.3 : safeParse de /kpi/filters live contre le schéma courant.
// Imprime chaque champ : présent | shape | safeParse(dim) + safeParse racine.
import { ProjectKpiFiltersSchema, KpiFilterDimensionSchema } from "../src/lib/api/project-kpi-schemas";

const BASE = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";
const PID = process.env["BC4_PROJECT_ID"] ?? "7e656b8c6c19";

async function main() {
  const lr = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { token } = await lr.json();
  const r = await fetch(`${BASE}/projects/${PID}/kpi/filters`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await r.json();
  console.log("HTTP", r.status, "— top-level keys:", Object.keys(raw).sort().join(", "));
  console.log("");
  const EXPECTED = ["operators","rats","bands","service_types","envs","dr","plaque","dor","arcep","commune","insee"] as const;
  for (const k of EXPECTED) {
    const v = raw[k];
    const kind = v === undefined ? "ABSENT" : typeof v;
    if (v !== undefined) {
      const r = KpiFilterDimensionSchema.safeParse(v);
      console.log(
        `  ${k.padEnd(15)} ${kind.padEnd(10)} shape=${Object.keys(v).sort().join(",")}  safeParse=${r.success ? "OK" : "FAIL "+ r.error.issues.map(i=>`${i.path.join(".")}:${i.message}`).join(";")}`
      );
    } else {
      console.log(`  ${k.padEnd(15)} ${kind}`);
    }
  }
  console.log("");
  const root = ProjectKpiFiltersSchema.safeParse(raw);
  console.log("ROOT safeParse:", root.success ? "OK" : "FAIL");
  if (!root.success) {
    console.log(root.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  }
}
main().catch(e => { console.error(e); process.exit(2); });
