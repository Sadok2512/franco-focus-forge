// DEMO-ONLY deterministic Assistant IA engine. Every number is computed from the
// project's mock measurement points or the RRC dictionary adapter — nothing is hardcoded.
import { applyFilters } from "@/lib/api/client";
import { getDictParamDetail } from "@/lib/api/dictionary";
import { pointsFor } from "@/lib/api/fixtures";
import type { AssistantFilters, Block, Evidence, ExecStep } from "@/lib/api/assistant-schemas";
import {
  METRICS,
  OPERATORS,
  type MeasurementPoint,
  type Operator,
  type Project,
} from "@/lib/api/schemas";

export type EngineResult = {
  scenario: string;
  blocks: Block[];
  evidence: Evidence[];
  follow_ups: string[];
  warnings: string[];
  steps: ExecStep[];
  error?: { code: string; message: string };
};

export const SUGGESTED_QUESTIONS = [
  "Compare le RRC Success Rate entre Orange et SFR à Paris.",
  "Analyse les performances NR par bande n78 et n28.",
  "Quels paramètres RRC diffèrent entre les opérateurs ?",
  "Où se trouvent les zones de faible SS-SINR ?",
  "Compare les débits DL LTE et NR.",
  "Identifie les zones candidates à un problème d'overshooting.",
  "Quels sites présentent un faible débit UL ?",
  "Analyse les performances EN-DC.",
];

const r1 = (v: number) => Math.round(v * 10) / 10;
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return r1(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo));
}
const nums = (pts: MeasurementPoint[], k: "dl" | "sinr" | "rsrp" | "latency") =>
  pts
    .map((p) => p[k])
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
const mean = (v: number[]) => (v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null);

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
/** Demo RRC setup outcome derived from the point (SINR-dependent). null = SINR missing → excluded. */
export function rrcOutcome(p: MeasurementPoint): boolean | null {
  if (p.sinr == null) return null;
  const pFail = p.sinr < -3 ? 0.35 : p.sinr < 3 ? 0.08 : 0.015;
  return hash(p.id + "|rrc") >= pFail;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export function detectScenario(q: string): string {
  const s = norm(q);
  if (s.includes("simule une erreur")) return "error";
  if (s.includes("overshoot")) return "overshooting";
  if (/\bul\b|montant|uplink/.test(s)) return "ul";
  if (s.includes("parametre")) return "params";
  if (s.includes("rrc") && /success|succes|taux|reussite/.test(s)) return "rrc_success";
  if (/en-?dc/.test(s)) return "endc";
  if (/n78|n28|bande/.test(s)) return "nr_bands";
  if (/sinr|couverture|zone/.test(s)) return "coverage";
  if (/debit|dl/.test(s) && s.includes("lte") && s.includes("nr")) return "dl_compare";
  return "unsupported";
}

function opsIn(q: string, pts: MeasurementPoint[]): Operator[] {
  const s = norm(q);
  const named = OPERATORS.filter((o) => s.includes(o.toLowerCase()));
  const present = OPERATORS.filter((o) => pts.some((p) => p.operator === o));
  const pick = named.length ? named.filter((o) => present.includes(o)) : present;
  return pick;
}

const STEPS: ExecStep[] = [
  { id: "scope", label: "Validation du périmètre et des filtres", duration_ms: 120 },
  { id: "query", label: "Agrégation des mesures filtrées", duration_ms: 260 },
  { id: "evidence", label: "Classification des preuves", duration_ms: 140 },
];

export async function runEngine(
  project: Project,
  question: string,
  f: AssistantFilters,
): Promise<EngineResult> {
  const scenario = detectScenario(question);
  const pts = applyFilters(pointsFor(project), f);
  const period = { start: project.periodStart, end: project.periodEnd };
  const srcPts: Evidence = {
    source_id: `pts:${project.id}`,
    source_type: "measurement_points",
    label: `Points de mesure — ${project.name} (fixture démo)`,
    sample_count: pts.length,
    aggregation: "Points filtrés par le contexte effectif",
    period,
  };
  const base = {
    scenario,
    blocks: [] as Block[],
    evidence: [srcPts],
    follow_ups: [] as string[],
    warnings: [] as string[],
    steps: STEPS,
  };
  if (scenario === "error")
    return {
      ...base,
      evidence: [],
      error: {
        code: "UPSTREAM_ERROR",
        message: "Erreur simulée du moteur d'analyse (fixture de démonstration).",
      },
    };

  if (!pts.length) {
    base.blocks.push({
      type: "text",
      heading: "Aucune donnée disponible",
      claims: [
        {
          text:
            project.status === "processing"
              ? "Le projet est en cours de traitement : aucune mesure n'est encore exploitable."
              : "Aucun point de mesure ne correspond aux filtres actifs. Élargissez le périmètre (opérateur, techno, bande, département).",
          kind: "UNAVAILABLE",
        },
      ],
    });
    return { ...base, scenario: "empty" };
  }

  const sid = srcPts.source_id;
  switch (scenario) {
    case "rrc_success": {
      const ops = opsIn(question, pts);
      const evSid = `rrc:${project.id}`;
      const rows = ops.map((op) => {
        const pop = pts.filter((p) => p.operator === op);
        const out = pop.map(rrcOutcome).filter((x): x is boolean => x != null);
        const ok = out.filter(Boolean).length;
        return {
          op,
          att: out.length,
          ok,
          rate: out.length ? r1((ok / out.length) * 100) : null,
          missing: pop.length - out.length,
          sinr: mean(nums(pop, "sinr")),
        };
      });
      const best = Math.max(...rows.map((r) => r.rate ?? -1));
      const att = rows.reduce((a, r) => a + r.att, 0);
      base.evidence.push({
        source_id: evSid,
        source_type: "rrc_events",
        label: "Événements RRC Setup dérivés des points (fixture démo)",
        sample_count: att,
        aggregation: "Somme par opérateur",
        period,
      });
      base.blocks.push({
        type: "table",
        heading: "Résultats principaux",
        source_id: evSid,
        formula:
          "Taux = RRCSetupComplete / RRCConnectionRequest × 100 ; Écart = taux − meilleur taux",
        columns: [
          { key: "op", label: "Opérateur" },
          { key: "att", label: "Tentatives", numeric: true },
          { key: "ok", label: "Succès", numeric: true },
          { key: "rate", label: "RRC Success", unit: "%", numeric: true },
          { key: "gap", label: "Écart", unit: "pt", numeric: true },
        ],
        rows: rows.map((r) => ({
          op: r.op,
          att: r.att,
          ok: r.ok,
          rate: r.rate,
          gap: r.rate == null ? null : r1(r.rate - best),
        })),
      });
      const weeks = [...new Set(pts.map((p) => weekOf(p.ts)))].sort();
      base.blocks.push({
        type: "chart",
        chart: "line",
        heading: "Évolution temporelle (par semaine)",
        x_label: "Semaine",
        y_label: "RRC Success",
        unit: "%",
        categories: weeks,
        sample_count: att,
        source_id: evSid,
        series: ops.map((op) => ({
          name: op,
          data: weeks.map((w) => {
            const out = pts
              .filter((p) => p.operator === op && weekOf(p.ts) === w)
              .map(rrcOutcome)
              .filter((x): x is boolean => x != null);
            return out.length >= 5 ? r1((out.filter(Boolean).length / out.length) * 100) : null;
          }),
        })),
      });
      const fails = pts.filter((p) => ops.includes(p.operator as Operator) && rrcOutcome(p) === false);
      base.blocks.push({
        type: "map",
        heading: `Répartition géographique des échecs (${fails.length})`,
        metric: "sinr",
        points: fails,
        center: project.center,
        source_id: evSid,
      });
      const worst = [...rows].filter((r) => r.rate != null).sort((a, b) => a.rate! - b.rate!)[0];
      base.blocks.push({
        type: "text",
        heading: "Analyse",
        claims: [
          ...rows.map((r) => ({
            text: `${r.op} : ${fmt(r.ok)} succès sur ${fmt(r.att)} tentatives, soit ${fmt(r.rate)} %.`,
            kind: "CALCULATED" as const,
            source_id: evSid,
          })),
          ...(worst
            ? [
                {
                  text: `${worst.op} présente le taux le plus faible et un SINR moyen de ${fmt(worst.sinr)} dB sur la même population. Il s'agit d'une corrélation, pas d'une cause démontrée.`,
                  kind: "INTERPRETED" as const,
                  source_id: sid,
                },
              ]
            : []),
          {
            text: "Les causes d'échec (rejectCause, timer T300) ne sont pas présentes dans ce jeu de données.",
            kind: "UNAVAILABLE",
          },
        ],
      });
      sampleWarnings(
        rows.map((r) => ({ k: r.op, n: r.att })),
        base.warnings,
      );
      const miss = rows.reduce((a, r) => a + r.missing, 0);
      if (miss)
        base.warnings.push(
          `${fmt(miss)} points exclus : SINR manquant (N/D), issue RRC non déterminable.`,
        );
      base.follow_ups = ["Voir le détail par bande", "Analyser les échecs", "Comparer par cellule"];
      break;
    }
    case "nr_bands": {
      const nr = pts.filter((p) => p.tech !== "LTE");
      const asked = ["n78", "n28"].filter((b) => norm(question).includes(b));
      const bands = (asked.length ? asked : [...new Set(nr.map((p) => p.band))].sort()).filter(
        (b) => nr.some((p) => p.band === b),
      );
      const missingBands = asked.filter((b) => !bands.includes(b));
      if (!bands.length) {
        unavailable(base, "Aucune mesure NR sur les bandes demandées dans le périmètre filtré.");
        break;
      }
      const box = bands.map((b) => {
        const v = nums(
          nr.filter((p) => p.band === b),
          "dl",
        );
        return [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => percentile(v, q)!);
      });
      const n = nr.filter((p) => bands.includes(p.band) && p.dl != null).length;
      base.blocks.push({
        type: "chart",
        chart: "boxplot",
        heading: "Débit DL NR par bande (P10 / P25 / P50 / P75 / P90)",
        x_label: "Bande",
        y_label: "Débit DL",
        unit: "Mbit/s",
        categories: bands,
        sample_count: n,
        source_id: sid,
        series: [{ name: "Débit DL", data: box }],
      });
      const ops = OPERATORS.filter((o) => nr.some((p) => p.operator === o));
      base.blocks.push({
        type: "table",
        heading: "Médiane DL par bande et opérateur",
        source_id: sid,
        formula: "P50 du débit DL, interpolation linéaire",
        columns: [
          { key: "band", label: "Bande" },
          ...ops.flatMap((o) => [
            { key: `${o}`, label: `${o} P50`, unit: "Mbit/s", numeric: true },
            { key: `${o}_n`, label: "n", numeric: true },
          ]),
        ],
        rows: bands.map((b) =>
          Object.fromEntries([
            ["band", b],
            ...ops.flatMap((o) => {
              const v = nums(
                nr.filter((p) => p.band === b && p.operator === o),
                "dl",
              );
              return [
                [o, percentile(v, 0.5)],
                [`${o}_n`, v.length],
              ];
            }),
          ]),
        ),
      });
      base.blocks.push({
        type: "text",
        heading: "Analyse",
        claims: [
          ...bands.map((b, i) => ({
            text: `${b} : médiane ${fmt(box[i]![2])} Mbit/s (P10 ${fmt(box[i]![0])}, P90 ${fmt(box[i]![4])}).`,
            kind: "CALCULATED" as const,
            source_id: sid,
          })),
          {
            text: "Un écart entre bandes basses (n28) et moyennes (n78) est attendu en raison de la largeur de canal ; la charge cellulaire n'est pas mesurée ici.",
            kind: "INTERPRETED",
          },
        ],
      });
      if (missingBands.length)
        base.warnings.push(`Bande(s) sans mesure dans le périmètre : ${missingBands.join(", ")}.`);
      sampleWarnings(
        bands.map((b, i) => ({
          k: b,
          n: nr.filter((p) => p.band === bands[i] && p.dl != null).length,
        })),
        base.warnings,
      );
      base.follow_ups = [
        "Compare les débits DL LTE et NR.",
        "Analyse les performances EN-DC.",
        "Où se trouvent les zones de faible SS-SINR ?",
      ];
      break;
    }
    case "params": {
      const dsid = `dict:${project.id}`;
      const ids = ["lte-sib1-qrxlevmin", "lte-reconf-a3", "nr-reconf-a3"];
      const ops = OPERATORS.filter((o) => pts.some((p) => p.operator === o));
      const rows: Record<string, string | number | null>[] = [];
      let total = 0;
      for (const id of ids) {
        try {
          const d = await getDictParamDetail(project.id, id, "operator", f);
          const row: Record<string, string | number | null> = {
            param: d.fiche.leaf,
            path: d.fiche.path,
          };
          const doms = new Set<string>();
          for (const o of ops) {
            const mr = d.matrix.rows.find((r) => r.key === o);
            total += mr?.total ?? 0;
            const top = mr?.cells.length ? [...mr.cells].sort((a, b) => b.n - a.n)[0]! : null;
            const label = top ? `${d.matrix.bins[top.bin_index]} (${fmt(r1(top.pct))} %)` : null;
            if (top) doms.add(d.matrix.bins[top.bin_index]!);
            row[o] = label;
          }
          row["diff"] = doms.size > 1 ? "Oui" : doms.size === 1 ? "Non" : null;
          rows.push(row);
        } catch {
          base.warnings.push(`Paramètre ${id} indisponible (service d'agrégation).`);
        }
      }
      base.evidence.push({
        source_id: dsid,
        source_type: "rrc_dictionary",
        label: "Dictionnaire RRC — matrice par opérateur",
        sample_count: total,
        aggregation: "Valeur dominante par opérateur (part des observations)",
        period,
      });
      base.blocks.push({
        type: "table",
        heading: "Valeurs dominantes par opérateur",
        source_id: dsid,
        formula:
          "Valeur dominante = bin le plus fréquent dans la matrice opérateur du dictionnaire",
        columns: [
          { key: "param", label: "Paramètre" },
          { key: "path", label: "Chemin ASN.1" },
          ...ops.map((o) => ({ key: o, label: o })),
          { key: "diff", label: "Diffère" },
        ],
        rows,
      });
      const diff = rows.filter((r) => r["diff"] === "Oui").map((r) => String(r["param"]));
      base.blocks.push({
        type: "text",
        heading: "Analyse",
        claims: [
          {
            text: diff.length
              ? `Paramètres dont la valeur dominante diffère entre opérateurs : ${diff.join(", ")}.`
              : "Aucune différence de valeur dominante entre opérateurs.",
            kind: "OBSERVED",
            source_id: dsid,
          },
          {
            text: "Une différence de paramétrage reflète une stratégie opérateur ; son impact sur les KPI n'est pas démontré par ces seules données.",
            kind: "INTERPRETED",
          },
        ],
      });
      base.follow_ups = [
        "Compare le RRC Success Rate entre Orange et SFR à Paris.",
        "Où se trouvent les zones de faible SS-SINR ?",
      ];
      break;
    }
    case "endc": {
      const e = pts.filter((p) => p.tech === "EN-DC");
      if (!e.length) {
        unavailable(base, "Aucune mesure EN-DC dans ce projet ou ce périmètre filtré.");
        break;
      }
      const ops = OPERATORS.filter((o) => e.some((p) => p.operator === o));
      const stat = ops.map((o) => {
        const pop = e.filter((p) => p.operator === o);
        const v = nums(pop, "dl");
        return {
          o,
          n: v.length,
          p10: percentile(v, 0.1),
          p50: percentile(v, 0.5),
          p90: percentile(v, 0.9),
          sinr: mean(nums(pop, "sinr")),
        };
      });
      base.blocks.push({
        type: "summary",
        heading: "Synthèse EN-DC",
        items: [
          {
            label: "Échantillons EN-DC",
            value: e.length,
            unit: "pts",
            kind: "OBSERVED",
            n: e.length,
            source_id: sid,
          },
          {
            label: "Débit DL médian",
            value: percentile(nums(e, "dl"), 0.5),
            unit: "Mbit/s",
            kind: "CALCULATED",
            n: nums(e, "dl").length,
            source_id: sid,
          },
          {
            label: "SINR moyen",
            value: mean(nums(e, "sinr")),
            unit: "dB",
            kind: "CALCULATED",
            n: nums(e, "sinr").length,
            source_id: sid,
          },
        ],
      });
      base.blocks.push({
        type: "table",
        heading: "Débit DL EN-DC par opérateur",
        source_id: sid,
        formula: "Percentiles par interpolation linéaire",
        columns: [
          { key: "o", label: "Opérateur" },
          { key: "n", label: "n", numeric: true },
          { key: "p10", label: "P10", unit: "Mbit/s", numeric: true },
          { key: "p50", label: "P50", unit: "Mbit/s", numeric: true },
          { key: "p90", label: "P90", unit: "Mbit/s", numeric: true },
          { key: "sinr", label: "SINR moy.", unit: "dB", numeric: true },
        ],
        rows: stat,
      });
      base.blocks.push({
        type: "chart",
        chart: "bar",
        heading: "Débit DL médian EN-DC",
        x_label: "Opérateur",
        y_label: "Débit DL P50",
        unit: "Mbit/s",
        categories: ops,
        sample_count: stat.reduce((a, s) => a + s.n, 0),
        source_id: sid,
        series: [{ name: "P50", data: stat.map((s) => s.p50) }],
      });
      base.blocks.push({
        type: "text",
        heading: "Analyse",
        claims: [
          {
            text: "Les échecs d'ajout SCG (SgNB Addition) et l'ancre LTE ne sont pas disponibles : la stabilité EN-DC ne peut pas être évaluée.",
            kind: "UNAVAILABLE",
          },
        ],
      });
      sampleWarnings(
        stat.map((s) => ({ k: s.o, n: s.n })),
        base.warnings,
      );
      base.follow_ups = [
        "Analyse les performances NR par bande n78 et n28.",
        "Compare les débits DL LTE et NR.",
      ];
      break;
    }
    case "coverage": {
      const th = METRICS.sinr.thresholds[0];
      const low = pts.filter((p) => p.sinr != null && p.sinr < th);
      const deps = [...new Set(pts.map((p) => p.dep))].sort();
      base.blocks.push({
        type: "summary",
        heading: "Zones de faible SINR",
        items: [
          {
            label: `Points SINR < ${th} dB`,
            value: low.length,
            unit: "pts",
            kind: "OBSERVED",
            n: low.length,
            source_id: sid,
          },
          {
            label: "Part du périmètre",
            value: r1((low.length / Math.max(1, nums(pts, "sinr").length)) * 100),
            unit: "%",
            kind: "CALCULATED",
            n: nums(pts, "sinr").length,
            source_id: sid,
          },
        ],
      });
      base.blocks.push({
        type: "table",
        heading: "Répartition par département",
        source_id: sid,
        formula: `Part = points SINR < ${th} dB / points avec SINR × 100`,
        columns: [
          { key: "dep", label: "Département" },
          { key: "n", label: "Points avec SINR", numeric: true },
          { key: "low", label: "SINR faible", numeric: true },
          { key: "share", label: "Part", unit: "%", numeric: true },
        ],
        rows: deps.map((d) => {
          const v = nums(
            pts.filter((p) => p.dep === d),
            "sinr",
          );
          const l = v.filter((x) => x < th).length;
          return { dep: d, n: v.length, low: l, share: v.length ? r1((l / v.length) * 100) : null };
        }),
      });
      base.blocks.push({
        type: "map",
        heading: `Localisation des points SINR < ${th} dB`,
        metric: "sinr",
        points: low,
        center: project.center,
        source_id: sid,
      });
      base.blocks.push({
        type: "text",
        heading: "Analyse",
        claims: [
          {
            text: "La concentration géographique des points faibles est observée ; interférence ou couverture insuffisante restent des hypothèses à vérifier sur site.",
            kind: "INTERPRETED",
          },
        ],
      });
      base.follow_ups = [
        "Identifie les zones candidates à un problème d'overshooting.",
        "Compare le RRC Success Rate entre Orange et SFR à Paris.",
      ];
      break;
    }
    case "dl_compare": {
      const ops = OPERATORS.filter((o) => pts.some((p) => p.operator === o));
      const lte = pts.filter((p) => p.tech === "LTE");
      const nr = pts.filter((p) => p.tech !== "LTE");
      if (!lte.length || !nr.length)
        base.warnings.push(
          "Comparaison partielle : une des technologies n'a aucune mesure dans le périmètre (N/D).",
        );
      base.blocks.push({
        type: "chart",
        chart: "bar",
        heading: "Débit DL moyen LTE vs NR",
        x_label: "Opérateur",
        y_label: "Débit DL moyen",
        unit: "Mbit/s",
        categories: ops,
        sample_count: nums(pts, "dl").length,
        source_id: sid,
        series: [
          {
            name: "LTE",
            data: ops.map((o) =>
              mean(
                nums(
                  lte.filter((p) => p.operator === o),
                  "dl",
                ),
              ),
            ),
          },
          {
            name: "NR / EN-DC",
            data: ops.map((o) =>
              mean(
                nums(
                  nr.filter((p) => p.operator === o),
                  "dl",
                ),
              ),
            ),
          },
        ],
      });
      base.blocks.push({
        type: "table",
        heading: "Détail",
        source_id: sid,
        formula: "Moyenne arithmétique ; ratio = NR / LTE",
        columns: [
          { key: "o", label: "Opérateur" },
          { key: "lte", label: "LTE", unit: "Mbit/s", numeric: true },
          { key: "nl", label: "n LTE", numeric: true },
          { key: "nr", label: "NR", unit: "Mbit/s", numeric: true },
          { key: "nn", label: "n NR", numeric: true },
          { key: "ratio", label: "Ratio", numeric: true },
        ],
        rows: ops.map((o) => {
          const a = nums(
            lte.filter((p) => p.operator === o),
            "dl",
          );
          const b = nums(
            nr.filter((p) => p.operator === o),
            "dl",
          );
          const ma = mean(a);
          const mb = mean(b);
          return {
            o,
            lte: ma,
            nl: a.length,
            nr: mb,
            nn: b.length,
            ratio: ma && mb != null ? r1(mb / ma) : null,
          };
        }),
      });
      base.blocks.push({
        type: "text",
        heading: "Analyse",
        claims: [
          {
            text: "Les populations LTE et NR ne sont pas mesurées aux mêmes emplacements : la comparaison est indicative.",
            kind: "INTERPRETED",
          },
        ],
      });
      base.follow_ups = [
        "Analyse les performances NR par bande n78 et n28.",
        "Analyse les performances EN-DC.",
      ];
      break;
    }
    case "overshooting":
      unavailable(
        base,
        "Impossible d'identifier des candidats overshooting : les données ne contiennent ni cellule serveuse (PCI/ECGI), ni liste de voisines, ni Timing Advance, ni position des sites. Aucune zone n'est désignée.",
      );
      base.follow_ups = ["Où se trouvent les zones de faible SS-SINR ?"];
      break;
    case "ul":
      unavailable(
        base,
        "Le débit UL n'est pas mesuré dans ce projet : aucun site ne peut être classé sur ce critère.",
      );
      base.follow_ups = ["Compare les débits DL LTE et NR."];
      break;
    default:
      unavailable(
        base,
        "Question non couverte par les analyses disponibles. Essayez une des questions suggérées (RRC Success, bandes NR, paramètres RRC, SINR, EN-DC, débits).",
      );
      base.follow_ups = SUGGESTED_QUESTIONS.slice(0, 3);
  }
  return base;
}

function unavailable(base: { blocks: Block[] }, text: string) {
  base.blocks.push({
    type: "text",
    heading: "Données insuffisantes",
    claims: [{ text, kind: "UNAVAILABLE" }],
  });
}
function sampleWarnings(groups: { k: string; n: number }[], w: string[]) {
  for (const g of groups)
    if (g.n < 30)
      w.push(`Échantillon faible pour ${g.k} (n = ${fmt(g.n)} < 30) : résultat peu fiable.`);
  const ns = groups.map((g) => g.n).filter((n) => n > 0);
  if (ns.length > 1 && Math.max(...ns) > 1.5 * Math.min(...ns))
    w.push("Populations de tailles inégales entre groupes : comparer avec prudence.");
}
export function weekOf(ts: string) {
  const d = new Date(ts.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const fmt = (v: number | null | undefined) =>
  v == null ? "N/D" : v.toLocaleString("fr-FR");
