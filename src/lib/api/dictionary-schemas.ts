import { z } from "zod";

// -------------------------------------------------------------------
// 1.8.0 — Dictionnaire RRC, forme unifiée V2.
//
// Les trois endpoints `/dict/tree`, `/dict/params`, `/dict/param/map`
// servent côté back deux « shapes » historiques :
//   • V2 (projet ingéré) : `branches[].system/count/messages[].params[]`
//   • B0 (projet seedé)  : `branches[].techno/channels[].messages[]`
//
// La UI 1.8.0 ne consomme QU'UNE forme — la V2 — pour avoir une seule
// vue de rendu. Côté adaptateur (`dictionary.ts`), la forme B0 est
// mappée en V2 (avec `params: []` quand aucune donnée n'est disponible)
// avant d'être exposée au composant.
// -------------------------------------------------------------------

export const ConversionRuleSchema = z.object({
  formula: z.string(),
  scale: z.number(),
  offset: z.number(),
  unit: z.string(),
  decimals: z.number().int(),
  ref: z.string(),
});
export type ConversionRule = z.infer<typeof ConversionRuleSchema>;

const GeoNode: z.ZodType<GeoNodeT> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    level: z.enum(["plaque", "dr", "departement", "site"]),
    children: z.array(GeoNode),
  }),
);
export type GeoNodeT = {
  id: string;
  label: string;
  level: "plaque" | "dr" | "departement" | "site";
  children: GeoNodeT[];
};

export const DictProjectSchema = z.object({
  id: z.string(),
  dimensions: z.object({
    operators: z.array(z.string()),
    services: z.array(z.string()),
    technos: z.array(z.string()),
    bands: z.array(z.string()),
    geo_tree: z.array(GeoNode),
    periods: z.array(z.string()),
  }),
});
export type DictProject = z.infer<typeof DictProjectSchema>;

// --------- Shape V2 brute servie par `/dict/tree` (projet ingéré) ---------
export const TreeV2ParamSchema = z.object({
  param: z.string(),
  count: z.number().int().nonnegative(),
});
export const TreeV2MessageSchema = z.object({
  message: z.string(),
  count: z.number().int().nonnegative(),
  params: z.array(TreeV2ParamSchema),
});
export const TreeV2BranchSchema = z.object({
  system: z.enum(["LTE", "NR"]),
  count: z.number().int().nonnegative(),
  messages: z.array(TreeV2MessageSchema),
});
export const TreeV2Schema = z.object({
  branches: z.array(TreeV2BranchSchema),
});

// --------- Shape B0 brute servie par `/dict/tree` (projet seedé) ---------
export const TreeB0MessageSchema = z.object({
  msg_id: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});
export const TreeB0ChannelSchema = z.object({
  name: z.string(),
  messages: z.array(TreeB0MessageSchema),
});
export const TreeB0BranchSchema = z.object({
  techno: z.enum(["LTE", "NR"]),
  channels: z.array(TreeB0ChannelSchema),
});
export const TreeB0Schema = z.object({
  branches: z.array(TreeB0BranchSchema),
});

// --------- Shape unifiée (ce que la UI consomme) ---------
// Mêmes clés que la V2 brute, mais toujours deux branches LTE + NR
// (la B0 est repliée en V2 avec `params: []` et `count` agrégé).
export const TreeSchema = z
  .object({
    branches: z.array(TreeV2BranchSchema),
  })
  .refine(
    (t) => t.branches.some((b) => b.system === "LTE") && t.branches.some((b) => b.system === "NR"),
    "LTE et NR doivent toujours être présents",
  );
export type DictTree = z.infer<typeof TreeSchema>;
export type DictTreeBranch = z.infer<typeof TreeV2BranchSchema>;
export type DictTreeMessage = z.infer<typeof TreeV2MessageSchema>;
export type DictTreeParam = z.infer<typeof TreeV2ParamSchema>;

// --------- /dict/params?system=&message=&operator=&band= ---------
// Chaque entrée = un paramètre (identifié par son `path` ASN.1) avec
// ses occurrences totales + répartition par (opérateur, bande).
export const ParamBucketSchema = z.object({
  operator: z.string(),
  band: z.string(),
  count: z.number().int().nonnegative(),
  avg_converted: z.number().nullable(),
});

// 1.8.1 — Distribution exacte (ou binnée) des valeurs observées pour
// le paramètre, servie par `/dict/params` (bc4-back 0.15.0). Chaque
// entrée est triée côté back et déjà filtrée au périmètre
// opérateur/bande actif. La UI alimente l'histogramme avec ce champ
// SANS retouche.
//   • `value_raw`       — chaîne : valeur ASN.1 brute (ex. "25",
//                         "n100") ou borne d'intervalle (`"[-98, -97)"`)
//                         si `value_distribution_mode === "binned"`.
//   • `value_converted` — chaîne : valeur convertie 3GPP (ex. "-116")
//                         ou `null` quand aucune règle n'est appliquée
//                         (paramètre enum). On n'invente JAMAIS 0.
//   • `count`           — nombre d'occurrences du bucket.
export const ParamDistributionEntrySchema = z.object({
  value_raw: z.string(),
  value_converted: z.string().nullable(),
  count: z.number().int().nonnegative(),
});
export type ParamDistributionEntry = z.infer<typeof ParamDistributionEntrySchema>;

export const ParamValueCellSchema = z.object({
  value_raw: z.string(),
  value_converted: z.string().nullable(),
  operator: z.string(),
  band: z.string(),
  count: z.number().int().nonnegative(),
});
export type ParamValueCell = z.infer<typeof ParamValueCellSchema>;

export const ParamRowSchema = z.object({
  system: z.enum(["LTE", "NR"]),
  message: z.string(),
  path: z.string(),
  count: z.number().int().nonnegative(),
  // Unité convertie (règle 3GPP). `null` = pas de règle de conversion,
  // la valeur reste brute. On n'invente JAMAIS une unité.
  unit_converted: z.string().nullable(),
  // Type ASN.1 : optionnel côté back actuel (peut être absent). Si
  // présent, utilisé dans la table de détail.
  type: z.string().nullable().optional(),
  // Valeur brute dominante + conversion dominante + part dominante :
  // optionnels côté back. Si manquants, la UI affiche « aucune valeur
  // observée » / « N/D » sur ces cellules.
  value_raw_dominant: z.union([z.string(), z.number()]).nullable().optional(),
  value_converted_dominant: z.union([z.string(), z.number()]).nullable().optional(),
  share_dominant: z.number().min(0).max(1).nullable().optional(),
  // Règle de conversion 3GPP (si connue côté back). Nullable = pas de
  // règle (valeur brute telle quelle, PAS de « conversion indisponible »).
  conversion_rule: ConversionRuleSchema.nullable().optional(),
  // Répartition par opérateur × bande.
  buckets: z.array(ParamBucketSchema),
  // 1.8.1 — Distribution des valeurs (histogramme) servie directement
  // par le back (bc4-back 0.15.0). Optionnels pour conserver la compat
  // ascendante : un back qui ne les renvoie pas doit continuer à passer
  // la validation Zod — la UI affichera l'EmptyState « aucune valeur
  // observée » dans ce cas, sans crasher. Côté consommation UI, on
  // normalise systématiquement via `?? []` / `?? "exact"`.
  value_distribution: z.array(ParamDistributionEntrySchema).optional(),
  value_distribution_mode: z.enum(["exact", "binned"]).optional(),
  // 1.9.0 — Extension du contrat (mock) : comptes par valeur × opérateur ×
  // bande, nécessaires au regroupement « Opérateur / Bande / Opérateur +
  // Bande » de l'histogramme ET de la table. Changement back à prévoir :
  // `/dict/params` doit servir ce champ. Absent → seul « Aucun » est proposé.
  value_matrix: z.array(ParamValueCellSchema).optional(),
});
export type ParamRow = z.infer<typeof ParamRowSchema>;

export const ParamListSchema = z.object({
  params: z.array(ParamRowSchema),
});
export type ParamList = z.infer<typeof ParamListSchema>;

// --------- /dict/param/map?path=&system=&operator=&band= ---------
// Liste de points lat/lon + valeur brute + valeur convertie.
export const ParamMapPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  // Les valeurs peuvent arriver en string (back actuel) ou en number.
  // `null` = valeur absente, N/D (jamais 0).
  value_raw: z.union([z.string(), z.number()]).nullable(),
  value_converted: z.union([z.string(), z.number()]).nullable(),
  operator: z.string().nullable(),
  band: z.string().nullable(),
});
export const ParamMapSchema = z.object({
  path: z.string(),
  system: z.enum(["LTE", "NR"]),
  points: z.array(ParamMapPointSchema),
});
export type ParamMap = z.infer<typeof ParamMapSchema>;
export type ParamMapPoint = z.infer<typeof ParamMapPointSchema>;
