// 1.12.0 — Clés canoniques « M_<role>[_<ressource>]_<grandeur> » pour
// les feuilles de MESURE sous MeasurementReport.
//
// Doctrine stricte :
//   • Classification PAR CONTENU (`asn1_path` = `TreeV2Param.param`),
//     JAMAIS par le label (nom du leaf).
//   • Les rôles et les ressources sont des marqueurs **déclarés** (substrings
//     exactes). Pas d'heuristique floue — si aucun marqueur ne matche, on
//     renvoie `null` et la UI conserve le nom RRC natif (via `leafOf()`).
//   • Portée : UNIQUEMENT les feuilles sous `MeasurementReport`.
//     Les autres messages (RRCConnectionReconfiguration, MasterInformationBlock,
//     SystemInformationBlockType1, …) **gardent leur nom RRC natif**.
//
// Table de rôle (ordre de précédence : neighbor > scell > serving) :
//   serving   : 'measResultServingCell' | 'measResultPCell' |
//               'measResultServingMOList' | 'servingCellResults'
//   neighbor  : 'measResultNeighCells' | 'measResultListEUTRA' |
//               'measResultNeighCellListNR' | 'resultsNeighCellList'
//   scell     : 'measResultServFreqList' | 'sCellResult' | 'measResultSCell'
//
// Précédence (déclarée) : `neighbor` est **plus spécifique** que `scell`,
// et `scell` plus spécifique que `serving`. On applique le premier rôle
// matché dans cet ordre. Si aucun marqueur ne matche → `role='unknown'`
// → PAS de clé M_ émise (le leaf garde son nom natif, et le fait est
// visible dans la liste des leaves non-mappées via `isMeasurementLeaf()`
// + `canonicalMeasureKey()` retournant `null`).
//
// Ressource NR (optionnelle, orthogonale au rôle) :
//   ssb       : 'resultsSSB-Cell' | 'ssbResults' | '/ssb/'
//   csirs     : 'resultsCSI-RS-Cell' | 'csi-rs' | 'csiRs'
//
// Grandeur (dernier segment du path, normalisé) :
//   • suffixes retirés : -r10, -r11, …, -r18 (releases 3GPP),
//     `Result`, `-Result`, `ResultNCell`, `ResultSCell`.
//   • Le radical doit matcher **exactement** l'une de : rsrp, rsrq,
//     sinr, cqi. Sinon → PAS une feuille de mesure, `null`.
//
// Exemples (TEST2, LTE+NR, live back 0.22.3) :
//   LTE serving    rsrq       → M_serving_rsrq
//   LTE neighbor   rsrp       → M_neighbor_rsrp
//   LTE SCell      rsrq       → M_scell_rsrq
//   NR  serving    SSB   rsrp → M_serving_ssb_rsrp
//   NR  neighbor   CSI-RS rsrq → M_neighbor_csirs_rsrq
//   NR  serving   (ssb-Results sans marqueur `resultsSSB-Cell`) → M_serving_rsrp
//                 (ressource `unknown` → ressource ABSENTE de la clé, cf. doctrine)

/** Grandeurs physiques prises en charge. */
export type MeasureQuantity = "rsrp" | "rsrq" | "sinr" | "cqi";

/** Rôle de la cellule mesurée. `unknown` = marqueur non reconnu. */
export type MeasureRole = "serving" | "neighbor" | "scell" | "unknown";

/** Ressource NR optionnelle. `null` = pas de marqueur NR dans le path. */
export type MeasureResource = "ssb" | "csirs" | null;

/** Vrai si `asn1_path` est une feuille sous `MeasurementReport`
 *  (contient le segment `measurementReport`, case-insensitive). */
export function isMeasurementReportPath(asn1Path: string): boolean {
  return /(^|\/)measurementReport(\/|$)/i.test(asn1Path);
}

/** Détection « feuille de mesure » : path sous `MeasurementReport` ET
 *  dernier segment normalisé qui matche l'une des grandeurs. */
export function isMeasurementLeaf(asn1Path: string): boolean {
  if (!isMeasurementReportPath(asn1Path)) return false;
  return extractQuantity(asn1Path) != null;
}

/** Extrait la grandeur normalisée depuis le dernier segment du path.
 *  Renvoie `null` si le radical ne matche pas rsrp/rsrq/sinr/cqi. */
export function extractQuantity(asn1Path: string): MeasureQuantity | null {
  const last = asn1Path.split("/").filter(Boolean).at(-1) ?? "";
  // Normalisation :
  //   • suppression des suffixes de release 3GPP (`-r10` .. `-r18`),
  //   • suppression des suffixes `Result`, `-Result`, `ResultNCell`,
  //     `ResultSCell` (dans cet ordre),
  //   • puis découpage sur hyphens pour isoler le radical.
  let s = last.replace(/-r\d{1,2}$/i, "");
  s = s.replace(/(ResultNCell|ResultSCell|-Result|Result)$/i, "");
  // Cas particulier : `rs-sinr` (NR SINR hors indices) → tokens ['rs','sinr'].
  const tokens = s
    .split("-")
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  // Priorité : le radical est le premier token qui matche l'une des grandeurs.
  for (const t of tokens) {
    if (t === "rsrp" || t === "rsrq" || t === "sinr" || t === "cqi") return t;
  }
  // Dernier recours : radical minuscule complet (ex. `rsrp` seul).
  const low = s.toLowerCase();
  if (low === "rsrp" || low === "rsrq" || low === "sinr" || low === "cqi") return low;
  return null;
}

/** Déduit le rôle via les marqueurs déclarés (précédence
 *  neighbor > scell > serving). `unknown` si aucun marqueur. */
export function extractRole(asn1Path: string): MeasureRole {
  const NEIGHBOR = [
    "measResultNeighCells",
    "measResultListEUTRA",
    "measResultNeighCellListNR",
    "resultsNeighCellList",
  ];
  const SCELL = ["measResultServFreqList", "sCellResult", "measResultSCell"];
  const SERVING = [
    "measResultServingCell",
    "measResultPCell",
    "measResultServingMOList",
    "servingCellResults",
  ];
  if (NEIGHBOR.some((m) => asn1Path.includes(m))) return "neighbor";
  if (SCELL.some((m) => asn1Path.includes(m))) return "scell";
  if (SERVING.some((m) => asn1Path.includes(m))) return "serving";
  return "unknown";
}

/** Déduit la ressource NR via les marqueurs déclarés. `null` si
 *  aucun marqueur (LTE, ou NR sans marqueur reconnu). */
export function extractResource(asn1Path: string): MeasureResource {
  const SSB = ["resultsSSB-Cell", "ssbResults", "/ssb/"];
  const CSIRS = ["resultsCSI-RS-Cell", "csi-rs", "csiRs"];
  if (SSB.some((m) => asn1Path.includes(m))) return "ssb";
  if (CSIRS.some((m) => asn1Path.includes(m))) return "csirs";
  return null;
}

/** Produit la clé canonique M_<role>[_<resource>]_<quantity> pour une
 *  feuille de mesure sous MeasurementReport. Renvoie `null` si :
 *    - le path n'est pas sous MeasurementReport,
 *    - la grandeur n'est pas reconnue (rsrp/rsrq/sinr/cqi),
 *    - le rôle est `unknown` (marqueur non reconnu).
 *  Dans ces cas la UI garde le nom RRC natif via `leafOf()`. */
export function canonicalMeasureKey(asn1Path: string): string | null {
  if (!isMeasurementReportPath(asn1Path)) return null;
  const quantity = extractQuantity(asn1Path);
  if (!quantity) return null;
  const role = extractRole(asn1Path);
  if (role === "unknown") return null;
  const resource = extractResource(asn1Path);
  return resource ? `M_${role}_${resource}_${quantity}` : `M_${role}_${quantity}`;
}
