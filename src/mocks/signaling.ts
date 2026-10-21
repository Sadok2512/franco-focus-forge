// Scénarios Signaling View déterministes (données de démonstration).
// Chaque capture est générée à partir d'une graine stable : mêmes temps,
// mêmes événements, mêmes messages à chaque chargement. Aucune mesure
// manquante n'est remplacée par 0 — les trous restent `null` (« N/D »).
import type {
  SigCall,
  SigCapture,
  SigCaptureMeta,
  SigConnectivitySegment,
  SigEvent,
  SigMessage,
  SigMobilityEvent,
  SigPayload,
  SigPayloadNode,
  SigSeries,
  SigTask,
  SigTrackPoint,
} from "@/lib/api/signaling-schemas";

type Seed = {
  id: string;
  name: string;
  captured_at: string;
  tech: string;
  message_count: number;
  duration_s: number;
  connectivity: SigConnectivitySegment[];
  events: [number, string, string | null, SigEvent["severity"], number | null][];
  markers: number[];
  tasks: [SigTask["dir"], number, number, string, string | null, number | null][];
  calls: [SigCall["kind"], number, number | null, number | null, SigCall["state"], number | null][];
  mobility: [number, string, SigMobilityEvent["kind"], number | null][];
  nr: boolean;
  volte: boolean;
};

const SEEDS: Seed[] = [
  {
    id: "test-3",
    name: "Test_3",
    captured_at: "2025-06-12 14:23",
    tech: "NR",
    message_count: 1897,
    duration_s: 632.851,
    connectivity: [
      { state: "LTE", start_s: 0, end_s: 240 },
      { state: "EN-DC", start_s: 200, end_s: 480 },
      { state: "NR-SA", start_s: 440, end_s: 632.851 },
    ],
    events: [
      [12.452, "RRC Setup", "LTE", "success", 140],
      [245.318, "SCG Addition", "EN-DC", "event", 1012],
      [412.703, "Handover", "LTE→NR", "info", 1422],
      [478.115, "HO Drop", null, "error", 1587],
      [590.226, "RRC Release", "NR", "event", 1734],
    ],
    markers: [96.4, 132.8, 168.2, 288.6, 340.9, 520.4],
    tasks: [
      ["DL", 120.452, 205.318, "Transfert DL (85,6 Mb)", "85,6 Mb", 402],
      ["DL", 300.1, 420.884, "Transfert DL (120,3 Mb)", "120,3 Mb", 1180],
      ["UL", 150.221, 290.552, "Transfert UL (32,1 Mb)", "32,1 Mb", 404],
    ],
    calls: [
      ["VoLTE", 20.1, 22.4, 74.2, "released", 160],
      ["VoNR", 120.452, 124.1, 194.558, "released", 782],
    ],
    mobility: [
      [412.703, "LTE→NR HO", "ho", 1422],
      [478.115, "HO Drop", "drop", 1587],
    ],
    nr: true,
    volte: true,
  },
  {
    id: "drive-test-nord",
    name: "Drive_Test_Nord",
    captured_at: "2025-06-10 09:41",
    tech: "NR",
    message_count: 2413,
    duration_s: 812.4,
    connectivity: [
      { state: "LTE", start_s: 0, end_s: 300 },
      { state: "EN-DC", start_s: 260, end_s: 700 },
      { state: "NR-SA", start_s: 660, end_s: 812.4 },
    ],
    events: [
      [8.2, "RRC Setup", "LTE", "success", 30],
      [262.5, "SCG Addition", "EN-DC", "event", 900],
      [455.9, "Handover", "LTE→NR", "info", 1400],
      [770.3, "RRC Release", "NR", "event", 2300],
    ],
    markers: [120.5, 180.2, 520.8],
    tasks: [
      ["DL", 100, 260, "Transfert DL (210,4 Mb)", "210,4 Mb", 350],
      ["UL", 300, 470, "Transfert UL (64,8 Mb)", "64,8 Mb", 950],
    ],
    calls: [["VoNR", 500, 504.2, 640.5, "released", 1600]],
    mobility: [[455.9, "LTE→NR HO", "success", 1400]],
    nr: true,
    volte: false,
  },
  {
    id: "voice-call",
    name: "Voice_Call",
    captured_at: "2025-06-08 16:02",
    tech: "LTE",
    message_count: 980,
    duration_s: 305.2,
    connectivity: [
      { state: "LTE", start_s: 0, end_s: 305.2 },
      { state: "EN-DC", start_s: 120, end_s: 305.2 },
    ],
    events: [
      [5.1, "RRC Setup", "LTE", "success", 16],
      [122.8, "SCG Addition", "EN-DC", "event", 400],
      [288.4, "RRC Release", "LTE", "event", 930],
    ],
    markers: [60.3, 200.7],
    tasks: [["DL", 40, 110, "Transfert DL (48,2 Mb)", "48,2 Mb", 130]],
    calls: [
      ["VoLTE", 30.5, 33.1, 210.8, "released", 100],
      ["VoNR", 150.2, null, null, "dropped", 480],
    ],
    mobility: [],
    nr: true,
    volte: true,
  },
  {
    id: "lte-indoor",
    name: "LTE_Indoor",
    captured_at: "2025-06-05 11:15",
    tech: "LTE",
    message_count: 640,
    duration_s: 182.6,
    connectivity: [{ state: "LTE", start_s: 0, end_s: 182.6 }],
    events: [
      [4.8, "RRC Setup", "LTE", "success", 18],
      [98.2, "RLF", "LTE", "error", 340],
      [170.5, "RRC Release", "LTE", "event", 600],
    ],
    markers: [40.1, 140.9],
    tasks: [["UL", 60, 150, "Transfert UL (12,6 Mb)", "12,6 Mb", 210]],
    calls: [],
    mobility: [[98.2, "RLF", "failure", 340]],
    nr: false,
    volte: true,
  },
];

export const SIGNALING_CAPTURES: SigCaptureMeta[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  captured_at: s.captured_at,
  tech: s.tech,
  message_count: s.message_count,
  duration_s: s.duration_s,
}));

// Bruit déterministe ∈ [-1, 1] stable par (clé, index) — aucun aléa entre
// deux chargements de la même capture.
function hash(seed: string, i: number, salt = 0): number {
  let h = 2166136261 ^ salt;
  const str = `${seed}:${i}:${salt}`;
  for (let c = 0; c < str.length; c++) {
    h ^= str.charCodeAt(c);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2000) / 1000 - 1;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function buildSeries(seed: string, key: string, label: string, unit: string, dur: number, kind: string): SigSeries {
  const step = dur / 300;
  const points = Array.from({ length: 301 }, (_, i) => {
    const t = i * step;
    let base: number;
    if (kind === "rsrp-lte") base = -92 + 6 * Math.sin(t / 90);
    else if (kind === "rsrp-nr") base = -78 + 5 * Math.sin(t / 70 + 1);
    else if (kind === "rsrq") base = -10.5 + 1.2 * Math.sin(t / 55);
    else base = 7 + 2.5 * Math.sin(t / 65 + 2);
    let v: number | null = r1(base + hash(seed, i, key.length) * (kind.startsWith("rsrp") ? 2.5 : 1));
    // Trou de mesure NR conservé tel quel (jamais comblé, jamais mis à 0).
    if (kind === "rsrp-nr" && t > dur * 0.52 && t < dur * 0.55) v = null;
    return { t: Math.round(t * 1000) / 1000, v };
  });
  return { key, label, unit, points };
}

function buildTrack(seed: string, dur: number): SigTrackPoint[] {
  const pts: SigTrackPoint[] = [];
  const n = 240;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    const f = i / n;
    pts.push({
      t: Math.round(t * 1000) / 1000,
      lat: 48.892 + 0.02 * f + 0.0012 * Math.sin(f * 9) + hash(seed, i, 7) * 0.0002,
      lng: 2.205 + 0.028 * f + 0.001 * Math.cos(f * 7) + hash(seed, i, 8) * 0.0002,
    });
  }
  return pts;
}

const SPECIAL_ROWS: Record<
  number,
  Partial<Pick<SigMessage, "t" | "dir" | "layer" | "name" | "procedure" | "rsrp" | "rsrq" | "sinr" | "octets">>
> = {
  782: { t: 120.452, dir: "UL", layer: "NAS", name: "ServiceRequest", procedure: "VoNR", rsrp: -92.1, rsrq: -11.3, sinr: 5.2, octets: 42 },
  783: { t: 120.462, dir: "DL", layer: "NAS", name: "ServiceReject", procedure: "VoNR", rsrp: -91.8, rsrq: -10.9, sinr: 5.8, octets: 28 },
  1012: { t: 245.318, dir: "DL", layer: "RRC NR", name: "SCGAdditionRequest", procedure: "EN-DC", rsrp: -82.3, rsrq: -10.1, sinr: 8.4, octets: 96 },
  1013: { t: 245.322, dir: "UL", layer: "RRC NR", name: "SCGAdditionRequestAcknowledge", procedure: "EN-DC", rsrp: -81.9, rsrq: -9.8, sinr: 8.6, octets: 84 },
  1421: { t: 412.703, dir: "UL", layer: "RRC NR", name: "HandoverRequest", procedure: "HO", rsrp: -88.5, rsrq: -11.2, sinr: 6.1, octets: 76 },
  1422: { t: 412.708, dir: "DL", layer: "RRC NR", name: "HandoverCommand", procedure: "HO", rsrp: -88.1, rsrq: -10.8, sinr: 6.5, octets: 104 },
  1438: { t: 412.912, dir: "UL", layer: "RRC NR", name: "HandoverConfirm", procedure: "HO", rsrp: -87.4, rsrq: -10.6, sinr: 6.9, octets: 62 },
  1587: { t: 478.115, dir: "DL", layer: "RRC NR", name: "RLFReport", procedure: "HO-Drop", rsrp: -105.7, rsrq: -15.2, sinr: -1.3, octets: 48 },
  1734: { t: 590.226, dir: "UL", layer: "NAS", name: "ServiceRequest", procedure: "VoNR", rsrp: -94.3, rsrq: -12.1, sinr: 4.7, octets: 42 },
};

const LAYERS = ["RRC NR", "RRC LTE", "NAS", "Événements Nemo", "MAC-RACH"];
const NAMES: Record<string, string[]> = {
  "RRC NR": ["RRCSetupRequest", "RRCSetup", "RRCReconfiguration", "RRCReconfigurationComplete", "MeasurementReport", "SCGFailureInformation"],
  "RRC LTE": ["RRCConnectionRequest", "RRCConnectionSetup", "RRCConnectionReconfiguration", "MeasurementReport", "UECapabilityInformation"],
  NAS: ["ServiceRequest", "ServiceAccept", "RegistrationRequest", "PDU Session Establishment"],
  "Événements Nemo": ["Nemo Event — Cell Change", "Nemo Event — Throughput Sample", "Nemo Event — GPS Fix"],
  "MAC-RACH": ["RACH Attempt", "RACH Success", "RACH Failure"],
};

function buildMessages(seed: Seed): SigMessage[] {
  const msgs: SigMessage[] = [];
  const specialByIndex = new Map<number, SigMessage>();
  for (const [t, name, tech, , mi] of seed.events) {
    if (mi == null) continue;
    specialByIndex.set(mi, {
      index: mi,
      t,
      dir: "DL",
      layer: tech === "LTE" ? "RRC LTE" : "RRC NR",
      name: name.replace(/ /g, ""),
      procedure: name,
      ecgi: "20815-4312895",
      pci: 349,
      earfcn: 630628,
      rsrp: null,
      rsrq: null,
      sinr: null,
      octets: 96,
    });
  }
  for (const [, , , , , mi] of seed.tasks) {
    if (mi != null && !specialByIndex.has(mi)) {
      specialByIndex.set(mi, { index: mi, t: 0, dir: "DL", layer: "Événements Nemo", name: "Nemo Event — Throughput Sample", procedure: "Data", ecgi: "20815-4312895", pci: 349, earfcn: 630628, rsrp: null, rsrq: null, sinr: null, octets: 64 });
    }
  }
  for (let i = 1; i <= seed.message_count; i++) {
    const layer = LAYERS[Math.floor(Math.abs(hash(seed.id, i, 1)) * LAYERS.length) % LAYERS.length]!;
    const names = NAMES[layer]!;
    const base: SigMessage = {
      index: i,
      t: Math.round(((i / seed.message_count) * seed.duration_s + hash(seed.id, i, 2) * 0.05) * 1000) / 1000,
      dir: hash(seed.id, i, 3) > 0 ? "UL" : "DL",
      layer,
      name: names[Math.floor(Math.abs(hash(seed.id, i, 4)) * names.length) % names.length]!,
      procedure: layer.startsWith("RRC") ? "RRC" : layer === "NAS" ? "NAS" : layer === "MAC-RACH" ? "RACH" : "Nemo",
      ecgi: "20815-4312895",
      pci: 349,
      earfcn: 630628,
      rsrp: r1(-95 + hash(seed.id, i, 5) * 8),
      rsrq: r1(-11 + hash(seed.id, i, 6) * 2),
      sinr: r1(6 + hash(seed.id, i, 9) * 4),
      octets: 24 + Math.floor(Math.abs(hash(seed.id, i, 10)) * 96),
    };
    msgs.push({ ...base, ...(specialByIndex.get(i) ?? {}), ...(SPECIAL_ROWS[i] ?? {}) });
  }
  return msgs;
}

function buildPayload(msg: SigMessage, seed: Seed): SigPayload {
  const oct = Math.max(8, Math.min(96, msg.octets));
  const hexLines: string[] = [];
  for (let i = 0; i < oct; i += 8) {
    const off = i.toString(16).padStart(4, "0");
    const bytes = Array.from({ length: Math.min(8, oct - i) }, (_, k) =>
      Math.floor(Math.abs(hash(seed.id, msg.index, 40 + i + k)) * 128 + 64)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase(),
    ).join(" ");
    hexLines.push(`${off}  ${bytes}`);
  }
  let decoded: SigPayloadNode;
  if (msg.name === "SCGAdditionRequest") {
    decoded = {
      key: "scgAdditionRequest",
      children: [
        {
          key: "criticalExtensions",
          children: [
            {
              key: "c1",
              children: [
                {
                  key: "scg-AdditionRequest-r15",
                  children: [
                    { key: "scg-CellGroupConfig", value: "present" },
                    { key: "radioResourceConfigDedicated", value: "present" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  } else if (msg.layer === "NAS") {
    decoded = {
      key: msg.name.charAt(0).toLowerCase() + msg.name.slice(1),
      children: [
        { key: "protocolDiscriminator", value: "5GMM" },
        { key: "securityHeaderType", value: "plain" },
        { key: "messageType", value: msg.name },
      ],
    };
  } else {
    decoded = {
      key: msg.name.charAt(0).toLowerCase() + msg.name.slice(1),
      children: [
        {
          key: "criticalExtensions",
          children: [
            { key: "c1", children: [{ key: "messageBody", value: "present" }] },
          ],
        },
      ],
    };
  }
  return {
    decoded,
    hex: hexLines.join("\n"),
    params: [
      { key: "ecgi", value: msg.ecgi ?? "N/D", unit: null },
      { key: "pci", value: msg.pci == null ? "N/D" : String(msg.pci), unit: null },
      { key: "rsrp", value: msg.rsrp == null ? "N/D" : String(msg.rsrp), unit: "dBm" },
      { key: "rsrq", value: msg.rsrq == null ? "N/D" : String(msg.rsrq), unit: "dB" },
      { key: "sinr", value: msg.sinr == null ? "N/D" : String(msg.sinr), unit: "dB" },
    ],
    call_flow: [
      { t: Math.max(0, msg.t - 0.42), from: "UE", to: "gNB", label: "PRACH Preamble" },
      { t: Math.max(0, msg.t - 0.18), from: "gNB", to: "UE", label: "RAR" },
      { t: msg.t, from: msg.dir === "UL" ? "UE" : "gNB", to: msg.dir === "UL" ? "gNB" : "UE", label: msg.name },
    ],
    details: {
      Capture: seed.name,
      "Message #": String(msg.index),
      "Temps (s)": String(msg.t),
      Sens: msg.dir,
      Couche: msg.layer,
      Procédure: msg.procedure,
      Octets: String(msg.octets),
    },
  };
}

function buildCapture(seed: Seed): SigCapture {
  const events: SigEvent[] = seed.events.map(([t, name, tech, severity, mi], i) => ({
    id: `${seed.id}-ev-${i}`,
    t,
    name,
    tech,
    severity,
    message_index: mi,
    ecgi: "20815-4312895",
    pci: 349,
  }));
  seed.markers.forEach((t, k) => {
    events.push({
      id: `${seed.id}-mk-${k}`,
      t,
      name: "Mesure périodique",
      tech: null,
      severity: "info",
      message_index: null,
      ecgi: null,
      pci: null,
    });
  });
  const tasks: SigTask[] = seed.tasks.map(([dir, a, b, label, throughput, mi], i) => ({
    id: `${seed.id}-task-${i}`,
    dir,
    start_s: a,
    end_s: b,
    label,
    throughput,
    message_index: mi,
  }));
  const calls: SigCall[] = seed.calls.map(([kind, attempt, start, end, state, mi], i) => ({
    id: `${seed.id}-call-${i}`,
    kind,
    attempt_s: attempt,
    start_s: start,
    end_s: end,
    state,
    message_index: mi,
  }));
  const mobility: SigMobilityEvent[] = seed.mobility.map(([t, name, kind, mi], i) => ({
    id: `${seed.id}-mob-${i}`,
    t,
    name,
    kind,
    message_index: mi,
  }));
  const measurements: SigSeries[] = [
    buildSeries(seed.id, "rsrp_lte", "RSRP LTE", "dBm", seed.duration_s, "rsrp-lte"),
    ...(seed.nr
      ? [
          buildSeries(seed.id, "rsrp_nr", "RSRP NR", "dBm", seed.duration_s, "rsrp-nr"),
          buildSeries(seed.id, "rsrq_nr", "RSRQ NR", "dB", seed.duration_s, "rsrq"),
          buildSeries(seed.id, "sinr_nr", "SINR NR", "dB", seed.duration_s, "sinr"),
        ]
      : []),
  ];
  const track = buildTrack(seed.id, seed.duration_s);
  const at = (t: number) => track[Math.min(track.length - 1, Math.max(0, Math.round((t / seed.duration_s) * (track.length - 1))))]!;
  const events_gps = seed.events.map(([t, , , , ], i) => {
    const p = at(t);
    return { event_id: `${seed.id}-ev-${i}`, t, lat: p.lat, lng: p.lng };
  });
  return {
    id: seed.id,
    name: seed.name,
    captured_at: seed.captured_at,
    tech: seed.tech,
    message_count: seed.message_count,
    duration_s: seed.duration_s,
    connectivity: seed.connectivity,
    events,
    tasks,
    calls,
    mobility,
    measurements,
    track,
    events_gps,
  };
}

const captureCache = new Map<string, SigCapture>();
const messageCache = new Map<string, SigMessage[]>();

export function getMockCapture(id: string): SigCapture | null {
  const seed = SEEDS.find((s) => s.id === id);
  if (!seed) return null;
  if (!captureCache.has(id)) captureCache.set(id, buildCapture(seed));
  return captureCache.get(id)!;
}

export function getMockMessages(id: string): SigMessage[] {
  const seed = SEEDS.find((s) => s.id === id);
  if (!seed) return [];
  if (!messageCache.has(id)) messageCache.set(id, buildMessages(seed));
  return messageCache.get(id)!;
}

export function getMockPayload(id: string, index: number): SigPayload | null {
  const seed = SEEDS.find((s) => s.id === id);
  const msg = getMockMessages(id).find((m) => m.index === index);
  if (!seed || !msg) return null;
  return buildPayload(msg, seed);
}
