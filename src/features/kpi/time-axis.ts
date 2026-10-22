/** 1.99.1 (lot C axe X temps) — centralisation du compute Clock (local|UTC)
 * côté front. Même math que `app/kpi/metrics_v3.py:341-343` du back : prend
 * `origin_ts` (HH:MM:SS.mmm, premier ts de la capture) + `t_rel_s` → nouvelle
 * heure du jour, modulo 86400 (jamais inventer de date).
 *
 * UTC = local − `utc_offset_min · 60`.
 *
 * `nmf_start_at` sert à :
 *   (a) détecter si l'axe Clock est disponible (null = pas d'en-tête #START
 *       → bascule Clock désactivée côté UI, repli automatique Capture time) ;
 *   (b) fournir la date (sans heure) pour l'axe label et le tooltip.
 */

export type TimeAxisMode = "clock-local" | "clock-utc" | "capture";

export type TimeAxisMeta = {
  nmf_start_at: string | null | undefined;
  origin_ts: string;
  utc_offset_min: number | null | undefined;
  capture_date: string | null | undefined;
};

const STORAGE_KEY = "bc3.metrics.timeAxisMode";

function parseOriginSecondsOfDay(origin_ts: string): number | null {
  // "HH:MM:SS[.mmm]" → secondes-du-jour (float).
  const parts = origin_ts.split(":");
  if (parts.length !== 3) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const [sStr = "0", msStr = "0"] = parts[2]!.split(".");
  const s = Number(sStr);
  const ms = Number((msStr + "000").slice(0, 3));
  if (![h, m, s, ms].every(Number.isFinite)) return null;
  return h * 3600 + m * 60 + s + ms / 1000;
}

function formatHMS(secondsOfDay: number, withMs = false): string {
  // Modulo 86400 : jamais inventer de date, respecte le comportement back.
  let sec = ((secondsOfDay % 86400) + 86400) % 86400;
  const h = Math.floor(sec / 3600);
  sec -= h * 3600;
  const m = Math.floor(sec / 60);
  sec -= m * 60;
  const si = Math.floor(sec);
  const ms = Math.round((sec - si) * 1000);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const base = `${pad2(h)}:${pad2(m)}:${pad2(si)}`;
  if (!withMs) return base;
  return `${base}.${String(ms).padStart(3, "0")}`;
}

export function isClockAvailable(meta: TimeAxisMeta | undefined | null): boolean {
  if (!meta) return false;
  if (!meta.nmf_start_at) return false;
  if (meta.utc_offset_min == null) return false;
  return parseOriginSecondsOfDay(meta.origin_ts) !== null;
}

export function timeAxisLabel(mode: TimeAxisMode, meta: TimeAxisMeta | undefined): string {
  if (mode === "capture") return "Capture time (s) · origin: capture start";
  if (!meta || !isClockAvailable(meta)) return "Capture time (s) · clock unavailable";
  const date = meta.capture_date ?? "";
  const offset = meta.utc_offset_min ?? 0;
  const sign = offset >= 0 ? "+" : "−";
  const abs = Math.abs(offset / 60);
  const prefix = mode === "clock-local" ? "Local time" : "UTC time";
  const detail = mode === "clock-local" ? ` · UTC${sign}${abs}h` : " · UTC";
  return `${prefix}${date ? ` · ${date}` : ""}${detail}`;
}

export function formatTick(t_rel_s: number, mode: TimeAxisMode, meta: TimeAxisMeta | undefined): string {
  if (mode === "capture") return `${Math.round(t_rel_s)} s`;
  if (!meta || !isClockAvailable(meta)) return `${Math.round(t_rel_s)} s`;
  const origin = parseOriginSecondsOfDay(meta.origin_ts);
  if (origin == null) return `${Math.round(t_rel_s)} s`;
  const local = origin + t_rel_s;
  const absolute = mode === "clock-local" ? local : local - (meta.utc_offset_min ?? 0) * 60;
  return formatHMS(absolute, false);
}

export function tooltipTriple(
  t_rel_s: number,
  meta: TimeAxisMeta | undefined,
): { local: string | null; utc: string | null; capture: string } {
  const capture = `${t_rel_s.toFixed(3)} s`;
  if (!meta || !isClockAvailable(meta)) return { local: null, utc: null, capture };
  const origin = parseOriginSecondsOfDay(meta.origin_ts);
  if (origin == null) return { local: null, utc: null, capture };
  const local = formatHMS(origin + t_rel_s, true);
  const utc = formatHMS(origin + t_rel_s - (meta.utc_offset_min ?? 0) * 60, true);
  return { local, utc, capture };
}

export function readTimeAxisMode(): TimeAxisMode {
  if (typeof window === "undefined") return "clock-local";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "clock-local" || v === "clock-utc" || v === "capture") return v;
  } catch {
    /* localStorage inaccessible : repli silencieux. */
  }
  return "clock-local";
}

export function writeTimeAxisMode(mode: TimeAxisMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* idem : jamais load-bearing. */
  }
}
