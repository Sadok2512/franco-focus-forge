import i18n from "@/lib/i18n";

export type CellLinkKind = "serving" | "neighbour" | "nr_anchor";
export type LinkConfidence = "proven" | "probable";

export const CELL_LINK_KINDS = ["serving", "neighbour", "nr_anchor"] as const;
export const CELL_LINK_COLORS: Record<CellLinkKind, string> = {
  serving: "#2563eb",
  neighbour: "#f59e0b",
  nr_anchor: "#9333ea",
};

export type RadioCellLink = {
  kind: CellLinkKind;
  lat: number;
  lng: number;
  siteName?: string | null | undefined;
  pci?: number | null | undefined;
  arfcn?: number | null | undefined;
  distanceM?: number | null | undefined;
  value?: string | number | null | undefined;
  unit?: string | null | undefined;
  confidence: LinkConfidence;
  source?: string | null | undefined;
};

export type MeasurementPointDetails = {
  seq: number;
  tRelS?: number | null | undefined;
  metricLabel: string;
  value?: string | number | null | undefined;
  unit?: string | null | undefined;
  serving?: RadioCellLink | undefined;
  neighbours: RadioCellLink[];
  nrAnchor?: RadioCellLink | undefined;
};

type ApiRadioLink = {
  lat: number;
  lng: number;
  site_name?: string | null | undefined;
  pci?: number | null | undefined;
  arfcn?: number | null | undefined;
  distance_m?: number | null | undefined;
  value?: string | number | null | undefined;
  unit?: string | null | undefined;
  confidence?: string | null | undefined;
};

export type ApiMeasurementPoint = {
  seq: number;
  lat: number;
  lng: number;
  value?: string | number | null | undefined;
  t_rel_s?: number | null | undefined;
  serving_site_name?: string | null | undefined;
  serving_site_id?: string | null | undefined;
  serving_cell_lat?: number | null | undefined;
  serving_cell_lng?: number | null | undefined;
  serving_cell_pci?: number | null | undefined;
  serving_cell_arfcn?: number | null | undefined;
  serving_link_distance_m?: number | null | undefined;
  serving_link_confidence?: string | null | undefined;
  serving_cell_source?: string | null | undefined;
  neighbour_links?: ApiRadioLink[] | null | undefined;
  nr_anchor_link?: ApiRadioLink | null | undefined;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Reduce detailed backend proof names to the two presentation styles. */
export function linkConfidence(value?: string | null): LinkConfidence {
  if (value === "probable" || value?.includes("nearest") || value?.startsWith("probable_"))
    return "probable";
  return "proven";
}

export function pointCellLinks(point: ApiMeasurementPoint): RadioCellLink[] {
  const links: RadioCellLink[] = [];
  const servingEvidence = point.serving_link_confidence ?? point.serving_cell_source;
  if (servingEvidence && finite(point.serving_cell_lat) && finite(point.serving_cell_lng)) {
    links.push({
      kind: "serving",
      lat: point.serving_cell_lat,
      lng: point.serving_cell_lng,
      siteName: point.serving_site_name ?? point.serving_site_id,
      pci: point.serving_cell_pci,
      arfcn: point.serving_cell_arfcn,
      distanceM: point.serving_link_distance_m,
      confidence: linkConfidence(servingEvidence),
      source: servingEvidence,
    });
  }
  for (const link of point.neighbour_links ?? []) {
    if (!finite(link.lat) || !finite(link.lng)) continue;
    links.push({
      kind: "neighbour",
      lat: link.lat,
      lng: link.lng,
      siteName: link.site_name,
      pci: link.pci,
      arfcn: link.arfcn,
      distanceM: link.distance_m,
      value: link.value,
      unit: link.unit,
      confidence: linkConfidence(link.confidence),
      source: link.confidence,
    });
  }
  const anchor = point.nr_anchor_link;
  if (anchor && finite(anchor.lat) && finite(anchor.lng)) {
    links.push({
      kind: "nr_anchor",
      lat: anchor.lat,
      lng: anchor.lng,
      siteName: anchor.site_name,
      pci: anchor.pci,
      arfcn: anchor.arfcn,
      distanceM: anchor.distance_m,
      value: anchor.value,
      unit: anchor.unit,
      confidence: linkConfidence(anchor.confidence),
      source: anchor.confidence,
    });
  }
  return links;
}

export function pointDetails(
  point: ApiMeasurementPoint,
  metricLabel: string,
  unit: string,
): MeasurementPointDetails {
  const links = pointCellLinks(point);
  return {
    seq: point.seq,
    tRelS: point.t_rel_s,
    metricLabel,
    value: point.value,
    unit,
    serving: links.find((link) => link.kind === "serving"),
    neighbours: links.filter((link) => link.kind === "neighbour"),
    nrAnchor: links.find((link) => link.kind === "nr_anchor"),
  };
}

function elapsed(value?: number | null): string {
  if (!finite(value)) return "—";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(3)
    .padStart(6, "0")}`;
}

function distance(value?: number | null): string {
  if (!finite(value)) return "—";
  return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(2)} km`;
}

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function cellLine(link: RadioCellLink): string {
  const identity = [
    `PCI ${text(link.pci)}`,
    `EARFCN ${text(link.arfcn)}`,
    distance(link.distanceM),
  ].join(" · ");
  const measured =
    link.value === null || link.value === undefined
      ? ""
      : ` · ${link.value}${link.unit ? ` ${link.unit}` : ""}`;
  return `${identity}${measured}`;
}

function appendCell(container: HTMLElement, link: RadioCellLink, title: string) {
  const row = document.createElement("div");
  row.className = "measurement-popup-cell";
  const heading = document.createElement("div");
  heading.className = "measurement-popup-cell-title";
  const swatch = document.createElement("span");
  swatch.className = `measurement-popup-line is-${link.confidence}`;
  swatch.style.setProperty("--measurement-link-color", CELL_LINK_COLORS[link.kind]);
  const strong = document.createElement("strong");
  strong.textContent = title;
  const badge = document.createElement("span");
  badge.className = `measurement-popup-confidence is-${link.confidence}`;
  badge.textContent = i18n.t(`mapPointPopup.confidence.${link.confidence}`);
  heading.append(swatch, strong, badge);
  const site = document.createElement("div");
  site.className = "measurement-popup-site";
  site.textContent = text(link.siteName);
  const identity = document.createElement("div");
  identity.className = "measurement-popup-identity";
  identity.textContent = cellLine(link);
  row.append(heading, site, identity);
  container.append(row);
}

/** Safe DOM card shared by Map, Signaling and KPI metric maps. */
export function buildMeasurementPointPopup(details: MeasurementPointDetails): HTMLElement {
  const card = document.createElement("article");
  card.className = "measurement-point-popup";
  card.dataset["testid"] = "measurement-point-popup";

  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = details.metricLabel;
  const value = document.createElement("span");
  value.className = "measurement-popup-value";
  value.textContent = `${text(details.value)}${details.unit ? ` ${details.unit}` : ""}`;
  header.append(title, value);

  const time = document.createElement("div");
  time.className = "measurement-popup-time";
  time.textContent = `${i18n.t("mapPointPopup.time")} ${elapsed(details.tRelS)} · seq ${details.seq}`;
  card.append(header, time);

  if (details.serving) appendCell(card, details.serving, i18n.t("mapPointPopup.serving"));
  if (details.neighbours.length) {
    const section = document.createElement("section");
    const heading = document.createElement("h4");
    heading.textContent = i18n.t("mapPointPopup.neighbours", { count: details.neighbours.length });
    section.append(heading);
    details.neighbours.forEach((link) =>
      appendCell(section, link, i18n.t("mapPointPopup.neighbour")),
    );
    card.append(section);
  }
  if (details.nrAnchor) appendCell(card, details.nrAnchor, i18n.t("mapPointPopup.nrAnchor"));
  return card;
}
