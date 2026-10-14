// DEMO-ONLY deterministic fixtures for the RRC Dictionary (C1). Not real measurements.
// The mock adapter aggregates these raw observations so every displayed number is
// traceable to a response computed from this file.
import type { Operator, Service } from "@/lib/api/schemas";

export type ConversionRule = { formula: string; scale: number; offset: number; unit: string; decimals: number; ref: string };

type NumericSpec = { kind: "numeric"; range: [number, number]; center: Record<Operator, number>; spread: number; binWidth: number };
type CategoricalSpec = { kind: "categorical"; values: string[]; weights: Record<Operator, number[]> };

export type ParamDef = {
  param_id: string; techno: "LTE" | "NR"; channel: string; msg_id: string; message: string;
  path: string; type: string; conversion_rule: ConversionRule | null;
  gps: boolean; simulateError?: boolean; samples: number;
  spec: NumericSpec | CategoricalSpec;
};

const W = (o: number[], s: number[], b: number[], f: number[]): Record<Operator, number[]> => ({ Orange: o, SFR: s, Bouygues: b, Free: f });
const C = (o: number, s: number, b: number, f: number): Record<Operator, number> => ({ Orange: o, SFR: s, Bouygues: b, Free: f });

export const BASE_PARAMS: ParamDef[] = [
  // ---------- LTE ----------
  { param_id: "lte-sib1-qrxlevmin", techno: "LTE", channel: "BCCH-DL-SCH", msg_id: "lte-sib1", message: "SystemInformationBlockType1",
    path: "systemInformationBlockType1.cellSelectionInfo.q-RxLevMin", type: "INTEGER (-70..-22)", gps: true, samples: 240,
    conversion_rule: { formula: "dBm = valeur × 2", scale: 2, offset: 0, unit: "dBm", decimals: 0, ref: "3GPP TS 36.331 §6.3.4 (Q-RxLevMin)" },
    spec: { kind: "numeric", range: [-70, -22], center: C(-64, -62, -63, -60), spread: 3, binWidth: 2 } },
  { param_id: "lte-rrcreq-cause", techno: "LTE", channel: "UL-CCCH", msg_id: "lte-rrcreq", message: "RRCConnectionRequest",
    path: "rrcConnectionRequest.criticalExtensions.rrcConnectionRequest-r8.establishmentCause", type: "ENUMERATED", gps: false, samples: 420, conversion_rule: null,
    spec: { kind: "categorical", values: ["mo-Data", "mo-Signalling", "mt-Access", "highPriorityAccess", "emergency"],
      weights: W([52, 28, 12, 6, 2], [56, 24, 13, 5, 2], [54, 27, 12, 5, 2], [53, 29, 11, 5, 2]) } },
  { param_id: "lte-rrcreq-ueid", techno: "LTE", channel: "UL-CCCH", msg_id: "lte-rrcreq", message: "RRCConnectionRequest",
    path: "rrcConnectionRequest.criticalExtensions.rrcConnectionRequest-r8.ue-Identity", type: "CHOICE", gps: false, samples: 420, conversion_rule: null,
    spec: { kind: "categorical", values: ["s-TMSI", "randomValue"], weights: W([81, 19], [77, 23], [79, 21], [74, 26]) } },
  { param_id: "lte-mr-rsrp", techno: "LTE", channel: "UL-DCCH", msg_id: "lte-mr", message: "MeasurementReport",
    path: "measurementReport.criticalExtensions.c1.measurementReport-r8.measResults.measResultPCell.rsrpResult", type: "RSRP-Range INTEGER (0..97)", gps: true, samples: 520,
    conversion_rule: { formula: "dBm = index − 140 (borne inférieure)", scale: 1, offset: -140, unit: "dBm", decimals: 0, ref: "3GPP TS 36.133 §9.1.4" },
    spec: { kind: "numeric", range: [0, 97], center: C(52, 46, 49, 43), spread: 11, binWidth: 5 } },
  { param_id: "lte-mr-rsrq", techno: "LTE", channel: "UL-DCCH", msg_id: "lte-mr", message: "MeasurementReport",
    path: "measurementReport.criticalExtensions.c1.measurementReport-r8.measResults.measResultPCell.rsrqResult", type: "RSRQ-Range INTEGER (0..34)", gps: true, samples: 520,
    conversion_rule: { formula: "dB = index × 0,5 − 20 (borne inférieure)", scale: 0.5, offset: -20, unit: "dB", decimals: 1, ref: "3GPP TS 36.133 §9.1.7" },
    spec: { kind: "numeric", range: [0, 34], center: C(22, 19, 20, 18), spread: 4, binWidth: 2 } },
  { param_id: "lte-reconf-a3", techno: "LTE", channel: "DL-DCCH", msg_id: "lte-reconf", message: "RRCConnectionReconfiguration",
    path: "rrcConnectionReconfiguration.criticalExtensions.c1.rrcConnectionReconfiguration-r8.measConfig.reportConfigToAddModList.reportConfigEUTRA.triggerType.event.eventId.eventA3.a3-Offset",
    type: "INTEGER (-30..30)", gps: true, samples: 300, conversion_rule: null,
    spec: { kind: "numeric", range: [-30, 30], center: C(6, 4, 6, 2), spread: 1.5, binWidth: 1 } },
  { param_id: "lte-reconf-tm", techno: "LTE", channel: "DL-DCCH", msg_id: "lte-reconf", message: "RRCConnectionReconfiguration",
    path: "rrcConnectionReconfiguration.criticalExtensions.c1.rrcConnectionReconfiguration-r8.radioResourceConfigDedicated.physicalConfigDedicated.antennaInfo.explicitValue.transmissionMode",
    type: "ENUMERATED", gps: true, samples: 300, conversion_rule: null,
    spec: { kind: "categorical", values: ["tm3", "tm4", "tm2", "tm8-v920", "tm9-v1020"],
      weights: W([58, 22, 6, 4, 10], [40, 38, 10, 6, 6], [52, 30, 8, 3, 7], [30, 50, 12, 4, 4]) } },
  { param_id: "lte-reconf-nas", techno: "LTE", channel: "DL-DCCH", msg_id: "lte-reconf", message: "RRCConnectionReconfiguration",
    path: "rrcConnectionReconfiguration.criticalExtensions.c1.rrcConnectionReconfiguration-r8.dedicatedInfoNASList", type: "SEQUENCE OF OCTET STRING", gps: true, samples: 120,
    conversion_rule: null, simulateError: true,
    spec: { kind: "categorical", values: ["présent", "absent"], weights: W([40, 60], [42, 58], [38, 62], [45, 55]) } },
  // ---------- NR ----------
  { param_id: "nr-setupreq-cause", techno: "NR", channel: "UL-CCCH", msg_id: "nr-setupreq", message: "RRCSetupRequest",
    path: "rrcSetupRequest.rrcSetupRequest.establishmentCause", type: "EstablishmentCause ENUMERATED", gps: false, samples: 300, conversion_rule: null,
    spec: { kind: "categorical", values: ["mo-Data", "mo-Signalling", "mt-Access", "mo-VoiceCall"],
      weights: W([60, 22, 12, 6], [58, 25, 12, 5], [61, 21, 13, 5], [57, 26, 11, 6]) } },
  { param_id: "nr-mr-rsrp", techno: "NR", channel: "UL-DCCH", msg_id: "nr-mr", message: "MeasurementReport",
    path: "measurementReport.criticalExtensions.measurementReport.measResults.measResultServingMOList.servCellId.measResultServingCell.measResult.cellResults.resultsSSB-Cell.rsrp",
    type: "RSRP-Range INTEGER (0..127)", gps: true, samples: 480,
    conversion_rule: { formula: "dBm = index − 157 (borne inférieure)", scale: 1, offset: -157, unit: "dBm", decimals: 0, ref: "3GPP TS 38.133 §10.1.6" },
    spec: { kind: "numeric", range: [0, 127], center: C(66, 60, 63, 58), spread: 12, binWidth: 5 } },
  { param_id: "nr-mr-sinr", techno: "NR", channel: "UL-DCCH", msg_id: "nr-mr", message: "MeasurementReport",
    path: "measurementReport.criticalExtensions.measurementReport.measResults.measResultServingMOList.servCellId.measResultServingCell.measResult.cellResults.resultsSSB-Cell.sinr",
    type: "SINR-Range INTEGER (0..127)", gps: true, samples: 480,
    conversion_rule: { formula: "dB = index × 0,5 − 23 (borne inférieure)", scale: 0.5, offset: -23, unit: "dB", decimals: 1, ref: "3GPP TS 38.133 §10.1.16" },
    spec: { kind: "numeric", range: [0, 127], center: C(70, 62, 66, 60), spread: 12, binWidth: 6 } },
  { param_id: "nr-reconf-a3", techno: "NR", channel: "DL-DCCH", msg_id: "nr-reconf", message: "RRCReconfiguration",
    path: "rrcReconfiguration.criticalExtensions.rrcReconfiguration.measConfig.reportConfigToAddModList.reportConfig.reportConfigNR.reportType.eventTriggered.eventId.eventA3.a3-Offset.rsrp",
    type: "MeasTriggerQuantityOffset INTEGER (-30..30)", gps: true, samples: 260, conversion_rule: null,
    spec: { kind: "numeric", range: [-30, 30], center: C(4, 6, 4, 2), spread: 1.5, binWidth: 1 } },
];

/** Mutable store so tests can mutate fixtures and prove the UI is not using stale constants. */
export const DICT_STORE: { params: ParamDef[]; seedSalt: number } = { params: structuredClone(BASE_PARAMS), seedSalt: 0 };
export function resetDictStore() { DICT_STORE.params = structuredClone(BASE_PARAMS); DICT_STORE.seedSalt = 0; obsCache.clear(); }
export function reseedDictStore(salt: number) { DICT_STORE.seedSalt = salt; obsCache.clear(); }

export type Observation = {
  param_id: string; operator: Operator; band: string; service: Service; dep: string;
  lat: number | null; lng: number | null; raw: number | string;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);
const pick = <T,>(a: readonly T[], r: () => number): T => a[Math.floor(r() * a.length)] as T;

const obsCache = new Map<string, Observation[]>();

export type DictProjectDims = {
  id: string; center: [number, number]; operators: Operator[]; services: Service[];
  technos: ("LTE" | "NR")[]; bands: string[]; departements: string[];
};

export function observationsFor(p: DictProjectDims): Observation[] {
  const key = `${p.id}:${DICT_STORE.seedSalt}`;
  const hit = obsCache.get(key);
  if (hit) return hit;
  const out: Observation[] = [];
  for (const def of DICT_STORE.params) {
    if (!p.technos.includes(def.techno)) continue;
    const bands = p.bands.filter((b) => (def.techno === "NR" ? b.startsWith("n") : !b.startsWith("n")));
    if (!bands.length) continue;
    const r = mulberry32(hash(`${p.id}|${def.param_id}|${DICT_STORE.seedSalt}`));
    const n = Math.round(def.samples * (p.operators.length / 4 + 0.25));
    for (let i = 0; i < n; i++) {
      const operator = pick(p.operators, r);
      const band = pick(bands, r);
      let raw: number | string;
      if (def.spec.kind === "numeric") {
        const s = def.spec;
        const bandShift = band === "B28" || band === "B20" || band === "n28" ? 3 : 0; // low bands: better coverage
        const v = s.center[operator] + bandShift + (r() + r() + r() - 1.5) * s.spread * 2;
        raw = Math.max(s.range[0], Math.min(s.range[1], Math.round(v)));
      } else {
        const w = def.spec.weights[operator];
        const tot = w.reduce((a, b) => a + b, 0);
        let x = r() * tot, k = 0;
        while (k < w.length - 1 && (x -= w[k] as number) > 0) k++;
        raw = def.spec.values[k] as string;
      }
      const gps = def.gps && r() > 0.04;
      out.push({
        param_id: def.param_id, operator, band, service: pick(p.services, r), dep: pick(p.departements, r), raw,
        lat: gps ? +(p.center[1] + (r() - 0.5) * 0.16).toFixed(5) : null,
        lng: gps ? +(p.center[0] + (r() - 0.5) * 0.28).toFixed(5) : null,
      });
    }
  }
  obsCache.set(key, out);
  return out;
}
