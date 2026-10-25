/** Shared site / cell information cards for the network map (Map page + Signaling View).
 * Built as DOM for MapLibre popups. Only fields returned by /sites are shown;
 * anything missing renders "—" — RF parameters are never inferred. */
import i18n from "@/lib/i18n";

type Props = Record<string, unknown>;
const t = (k: string) => i18n.t(`mapPopup.${k}`);

/** First present value among API aliases. */
export function pick(p: Props, keys: string[]): unknown {
  for (const k of keys) {
    const v = p[k];
    if (v != null && v !== "") return v;
  }
  return null;
}

export const FIELD = {
  siteName: ["site_name", "name"],
  siteId: ["site_id"],
  operator: ["operator", "operator_name"],
  cellName: ["cell_name", "cell_label", "name"],
  cellId: ["cell_id", "eci", "nci", "ci"],
  techno: ["techno", "technology", "tech", "rat"],
  band: ["band", "band_label"],
  arfcn: ["earfcn", "nrarfcn", "arfcn", "dl_earfcn", "ssb_arfcn"],
  pci: ["pci"],
  cgi: ["ecgi", "ncgi", "cgi"],
  azimuth: ["azimuth", "azimut"],
  height: ["antenna_height", "height", "hba"],
  mtilt: ["mechanical_tilt", "tilt_mechanical", "tilt_m", "mtilt"],
  etilt: ["electrical_tilt", "tilt_electrical", "tilt_e", "etilt"],
  bandwidth: ["bandwidth", "bandwidth_mhz", "bw"],
  siteType: ["site_type", "type_site", "site_category"],
} as const;

export const cellKey = (p: Props) =>
  String(pick(p, [...FIELD.cellId]) ?? `${pick(p, [...FIELD.siteId]) ?? ""}:${pick(p, [...FIELD.cellName]) ?? ""}:${p["band"] ?? ""}:${p["azimuth"] ?? ""}`);

export const isNr = (p: Props) => {
  const tech = String(pick(p, [...FIELD.techno]) ?? "").toUpperCase();
  return tech.includes("5G") || tech === "NR" || /^N\d+$/i.test(String(p["band"] ?? ""));
};

const show = (v: unknown, unit = "") => (v == null || v === "" ? "—" : `${v}${unit}`);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function badge(label: string, nr: boolean) {
  return el("span", `bc4-pop-badge ${nr ? "is-nr" : "is-lte"}`, label);
}

function grid(rows: Array<[string, string]>) {
  const dl = el("dl", "bc4-pop-grid");
  rows.forEach(([k, v]) => {
    dl.append(el("dt", undefined, k), el("dd", v === "—" ? "is-empty" : undefined, v));
  });
  return dl;
}

function header(title: string, badges: HTMLElement[]) {
  const h = el("div", "bc4-pop-head");
  h.append(el("strong", undefined, title));
  const b = el("span", "bc4-pop-badges");
  badges.forEach((x) => b.append(x));
  h.append(b);
  return h;
}

export function buildSiteCard(
  site: Props,
  coords: [number, number],
  operatorName: string,
  cells: Props[] | "loading" | "error",
  onCell: (cell: Props) => void,
): HTMLElement {
  const root = el("div", "bc4-pop");
  const list = Array.isArray(cells) ? cells : [];
  const hasNr = list.some(isNr) || Number(site["n_5g"]) > 0;
  const hasLte = list.some((c) => !isNr(c)) || Number(site["n_4g"]) > 0 || Number(site["n_lte"]) > 0;
  const techs = [hasLte ? "4G" : null, hasNr ? "5G" : null].filter(Boolean) as string[];
  const bands = [...new Set(list.map((c) => c["band"]).filter((b) => b != null && b !== ""))].map(String);
  const name = String(pick(site, [...FIELD.siteName]) ?? pick(site, [...FIELD.siteId]) ?? "—");
  root.append(header(name, techs.map((x) => badge(x, x === "5G"))));
  root.append(
    grid([
      [t("siteName"), show(pick(site, [...FIELD.siteName]))],
      [t("siteId"), show(pick(site, [...FIELD.siteId]))],
      [t("operator"), operatorName],
      [t("latLng"), `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`],
      [t("technologies"), techs.length ? techs.join(" / ") : "—"],
      [t("bands"), bands.length ? bands.join(", ") : "—"],
      [t("cells"), show(site["n_cells"] ?? (list.length || null))],
      [t("siteType"), show(pick(site, [...FIELD.siteType]))],
    ]),
  );
  root.append(el("p", "bc4-pop-section", t("cellSummary")));
  if (cells === "loading") root.append(el("p", "bc4-pop-note", t("loadingCells")));
  else if (cells === "error") root.append(el("p", "bc4-pop-note", t("cellsError")));
  else if (!list.length) root.append(el("p", "bc4-pop-note", t("noCells")));
  else {
    const table = el("table", "bc4-pop-cells");
    const head = el("tr");
    [t("cell"), t("tech"), t("band"), "PCI", "ARFCN"].forEach((h) => head.append(el("th", undefined, h)));
    table.append(head);
    list.forEach((c) => {
      const tr = el("tr");
      tr.tabIndex = 0;
      tr.setAttribute("role", "button");
      [
        show(pick(c, [...FIELD.cellName]) ?? pick(c, [...FIELD.cellId])),
        isNr(c) ? "NR" : "LTE",
        show(c["band"]),
        show(c["pci"]),
        show(pick(c, [...FIELD.arfcn])),
      ].forEach((v) => tr.append(el("td", undefined, v)));
      const go = (e: Event) => {
        e.stopPropagation();
        onCell(c);
      };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => e.key === "Enter" && go(e));
      table.append(tr);
    });
    const wrap = el("div", "bc4-pop-scroll");
    wrap.append(table);
    root.append(wrap);
  }
  return root;
}

export function buildCellCard(cell: Props, operatorName: string, onSite: (() => void) | null): HTMLElement {
  const root = el("div", "bc4-pop");
  const nr = isNr(cell);
  // Multi-band cells carry a `bands` list (one slice per band on the map);
  // single-band cells fall back to their lone `band`.
  const bands =
    Array.isArray(cell["bands"]) && cell["bands"].length
      ? [...new Set(cell["bands"].map(String))]
      : cell["band"] != null && cell["band"] !== ""
        ? [String(cell["band"])]
        : [];
  const name = String(pick(cell, [...FIELD.cellName]) ?? pick(cell, [...FIELD.cellId]) ?? "—");
  root.append(header(name, [badge(nr ? "NR" : "LTE", nr), ...bands.map((b) => el("span", "bc4-pop-badge", b))]));
  root.append(
    grid([
      [t("cellNameId"), `${show(pick(cell, [...FIELD.cellName]))} / ${show(pick(cell, [...FIELD.cellId]))}`],
      [t("parentSite"), show(pick(cell, ["site_name"]) ?? pick(cell, [...FIELD.siteId]))],
      [t("operator"), operatorName],
      [t("tech"), show(pick(cell, [...FIELD.techno]))],
      [t("band"), bands.length ? bands.join(", ") : "—"],
      [nr ? "NRARFCN" : "EARFCN", show(pick(cell, [...FIELD.arfcn]))],
      ["PCI", show(cell["pci"])],
      [nr ? "NCGI" : "ECGI", show(pick(cell, [...FIELD.cgi]))],
      [t("azimuth"), show(pick(cell, [...FIELD.azimuth]), "°")],
      [t("height"), show(pick(cell, [...FIELD.height]), " m")],
      [t("tilt"), `${show(pick(cell, [...FIELD.mtilt]), "°")} / ${show(pick(cell, [...FIELD.etilt]), "°")}`],
      [t("bandwidth"), show(pick(cell, [...FIELD.bandwidth]), " MHz")],
    ]),
  );
  if (onSite) {
    const b = el("button", "bc4-pop-link", t("goToSite"));
    b.type = "button";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onSite();
    });
    root.append(b);
  }
  return root;
}
