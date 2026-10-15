// CSV / XLSX parsing for the geography import. The schema is NOT fixed: we only expose columns.
import type { GeoField, GeoMapping } from "@/lib/api/settings-schemas";
import { GEO_FIELDS } from "@/lib/api/settings-schemas";

export type Table = { columns: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string): Table {
  const src = text.replace(/^\ufeff/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  const lines = out.filter((r) => r.some((c) => c.trim()));
  if (!lines.length) throw new Error("Fichier vide.");
  const columns = lines[0]!.map((c) => c.trim());
  if (columns.some((c) => !c)) throw new Error("En-tête invalide : colonne sans nom.");
  return {
    columns,
    rows: lines
      .slice(1)
      .map((l) => Object.fromEntries(columns.map((c, i) => [c, (l[i] ?? "").trim()]))),
  };
}

export async function parseXlsx(buf: ArrayBuffer): Promise<Table> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!ws) throw new Error("Classeur sans feuille.");
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  const csv = aoa
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return parseCsv(csv);
}

export async function parseFile(file: File): Promise<Table> {
  const n = file.name.toLowerCase();
  if (n.endsWith(".csv")) return parseCsv(await file.text());
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return parseXlsx(await file.arrayBuffer());
  throw new Error("Format non pris en charge : CSV ou XLSX attendu.");
}

const ALIASES: Record<GeoField, string[]> = {
  plaque: ["plaque"],
  dr: ["dr", "direction regionale", "direction_regionale"],
  departement: ["departement", "dept", "dep"],
  site_id: ["site_id", "id_site", "code_site", "id"],
  site: ["site", "nom_site"],
  point: ["point", "point_mesure"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon"],
  indoor_level: ["niveau", "indoor", "etage", "indoor_level"],
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
/** Suggestion only; the user validates/changes every mapping. */
export function suggestMapping(columns: string[]): GeoMapping {
  const m: GeoMapping = {};
  for (const f of GEO_FIELDS)
    m[f.key] = columns.find((c) => ALIASES[f.key].includes(norm(c))) ?? null;
  return m;
}
