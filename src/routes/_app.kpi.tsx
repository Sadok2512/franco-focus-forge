import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  LineChart,
  Map as MapIcon,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  Component,
  type ErrorInfo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EChartsOption } from "echarts";

import { Chart } from "@/components/bc4/Chart";
import { LoadingSkeleton } from "@/components/bc4/States";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { downloadCsv } from "@/features/dictionary/shared";
import {
  ApiHttpError,
  ApiNetworkError,
  ApiUnauthenticatedError,
} from "@/lib/api/http";
import {
  KpiContractMismatchError,
  KpiRequestError,
  getBackHealth,
  getProjectKpi,
  getProjectKpiCatalog,
  getProjectKpiFilters,
} from "@/lib/api/project-kpi";
import type {
  KpiCatalogItem,
  KpiGroupRow,
  KpiStatus,
  ProjectKpiDetail,
} from "@/lib/api/project-kpi-schemas";
import { useActiveProject } from "@/lib/activeProject";
import { useFilters } from "@/lib/filters";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/_app/kpi")({
  head: () => ({
    meta: [
      { title: "KPI Analytics — BC4" },
      {
        name: "description",
        content:
          "Catalogue KPI radio scopé projet (v2) : statuts par le CONTENU, aucun chiffre sans sa source back.",
      },
      { property: "og:title", content: "KPI Analytics — BC4" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KpiPageBoundary,
});

/** React Error Boundary — attrape toute exception de rendu dans la page
 *  /kpi (ex. accès à un champ undefined, lib externe qui lève) et rend un
 *  état lisible avec un bouton Réessayer. Jamais un panneau gris muet. */
class KpiErrorBoundary extends Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  override state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  override componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("KpiErrorBoundary caught:", err, info?.componentStack);
  }
  retry = () => this.setState({ err: null });
  override render() {
    if (this.state.err) {
      return (
        <div className="p-4">
          <KpiErrorBanner
            title="Erreur d'affichage de la page KPI"
            message={this.state.err.message || "Exception JavaScript lors du rendu"}
            details={this.state.err.stack?.split("\n").slice(0, 4).join("\n")}
            onRetry={this.retry}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

function KpiPageBoundary() {
  return (
    <KpiErrorBoundary>
      <KpiPage />
    </KpiErrorBoundary>
  );
}

/** Bandeau d'erreur normalisé — lisible, actionnable, jamais aveugle. */
function KpiErrorBanner({
  title,
  message,
  details,
  onRetry,
  tone = "bad",
}: {
  title: string;
  message: string;
  details?: string | null | undefined;
  onRetry?: (() => void) | undefined;
  tone?: "bad" | "warn" | undefined;
}) {
  const palette =
    tone === "warn"
      ? "border-sev-warn/40 bg-sev-warn/5 text-sev-warn"
      : "border-sev-bad/40 bg-sev-bad/5 text-sev-bad";
  return (
    <div className={`panel flex flex-col gap-2 border p-4 ${palette}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <strong className="text-sm">{title}</strong>
      </div>
      <p className="text-xs">{message}</p>
      {details && (
        <pre className="max-h-32 overflow-auto rounded border border-border/40 bg-background/50 p-2 font-mono text-[10px] text-muted-foreground">
          {details}
        </pre>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex h-7 w-fit items-center gap-1 rounded-md border border-current px-2 text-[11px]"
        >
          <RefreshCw className="h-3 w-3" /> Réessayer
        </button>
      )}
    </div>
  );
}

/** Classifie une erreur de requête useQuery → texte lisible + tonalité. */
function classifyKpiError(err: unknown): {
  title: string;
  message: string;
  details?: string | undefined;
  tone: "bad" | "warn";
} {
  if (err instanceof KpiContractMismatchError) {
    return {
      title: "Contrat back incompatible",
      message: `Réponse non conforme au schéma Zod attendu${
        err.backVersion ? ` (back version ${err.backVersion})` : ""
      }. Mettre à jour le front ou le back.`,
      details: err.zodMessages.join("\n"),
      tone: "warn",
    };
  }
  if (err instanceof ApiUnauthenticatedError) {
    return {
      title: "Session expirée",
      message: err.message || "Reconnecte-toi pour accéder à cette page.",
      tone: "warn",
    };
  }
  if (err instanceof ApiNetworkError) {
    return {
      title: "Backend injoignable",
      message: err.message || "Impossible de contacter l'API.",
      tone: "bad",
    };
  }
  if (err instanceof ApiHttpError) {
    return {
      title: `HTTP ${err.status ?? "?"} ${err.code ?? ""}`,
      message: err.message || "Erreur serveur.",
      tone: "bad",
    };
  }
  if (err instanceof KpiRequestError) {
    return {
      title: "Erreur de requête KPI",
      message: err.message,
      tone: "bad",
    };
  }
  const e = err as Error | null;
  return {
    title: "Erreur inconnue",
    message: e?.message || String(err),
    details: e?.stack?.split("\n").slice(0, 3).join("\n"),
    tone: "bad",
  };
}

// 1.17.4 — Version front : voir import `APP_VERSION` en tête de fichier
// (unique source → `lib/version.ts` ← `package.json`). Même source que
// le label v{APP_VERSION} à côté du logo dans l'en-tête
// (AppShell:HeaderVersion). Jamais une string tapée à la main.

const css = (v: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** `null | undefined | ""` → tiret long. Jamais 0 par défaut. */
function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v.trim() : String(v);
  return s === "" ? "—" : s;
}

function nd(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/D";
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fri(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/D";
  return Math.round(v).toLocaleString("fr-FR");
}

// 1.17.0 — Palette opérateurs cohérente avec maquette approuvée.
// Hex direct (brand colors) partagée par bars, legends et dots table.
const OP_HEX: Record<string, string> = {
  Orange: "#FF7900",
  SFR: "#E2001A",
  Bouygues: "#009FE3",
  Free: "#7C8794",
};
function opColor(name: string | null | undefined): string {
  if (!name) return "#CBD5E1";
  return OP_HEX[name] ?? "#CBD5E1";
}

/** Rendu libellé racine techno. Le back renvoie `ENDC` / `AGGREGATE` ;
 *  la maquette approuvée veut `EN-DC` et `KPI agrégés`. On n'altère
 *  JAMAIS les codes KPI ou les clés du back — purement affichage. */
function technoLabel(code: string): string {
  if (code === "ENDC") return "EN-DC";
  if (code === "AGGREGATE") return "KPI agrégés";
  return code;
}

/** Ordre canonique des racines imposé par la maquette (spec).
 *  Toute techno inconnue atterrit à la fin dans l'ordre back. */
const TECHNO_ORDER = ["LTE", "NR", "ENDC", "AGGREGATE"] as const;
function sortTechnoRoots<T extends { techno: string }>(roots: T[]): T[] {
  const idx = new Map<string, number>(TECHNO_ORDER.map((t, i) => [t, i]));
  return [...roots].sort((a, b) => {
    const ai = idx.get(a.techno) ?? 100 + roots.indexOf(a);
    const bi = idx.get(b.techno) ?? 100 + roots.indexOf(b);
    return ai - bi;
  });
}

function opLabel(name: string | null | undefined): string {
  return name && name.trim() ? name : "N/D";
}

const STATUS_CLASS: Record<KpiStatus, string> = {
  AVAILABLE: "bg-sev-good/15 text-sev-good",
  PENDING: "bg-sev-warn/15 text-sev-warn",
  UNVALIDATED: "bg-muted text-muted-foreground",
  UNAVAILABLE: "bg-sev-bad/15 text-sev-bad",
  NOT_APPLICABLE: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<KpiStatus, string> = {
  AVAILABLE: "Available",
  PENDING: "Pending",
  UNVALIDATED: "Unvalidated",
  UNAVAILABLE: "Unavailable",
  NOT_APPLICABLE: "N/A",
};

/** Compteurs par techno — `<total> · <AVAILABLE> Avail`. Jamais inventé :
 *  les valeurs viennent de `counts_by_techno[techno]` renvoyée par le back
 *  (zéro si le statut manque de la réponse). */
function TechnoBadge({
  techno,
  counts,
}: {
  techno: string;
  counts?: Record<string, number> | undefined;
}) {
  const c = counts ?? {};
  const total =
    (c["AVAILABLE"] ?? 0) +
    (c["PENDING"] ?? 0) +
    (c["UNVALIDATED"] ?? 0) +
    (c["UNAVAILABLE"] ?? 0);
  const avail = c["AVAILABLE"] ?? 0;
  return (
    <span
      title={`total ${total} · AVAILABLE ${avail} · PENDING ${c["PENDING"] ?? 0} · UNVALIDATED ${c["UNVALIDATED"] ?? 0} · UNAVAILABLE ${c["UNAVAILABLE"] ?? 0} (${techno})`}
      className="ml-auto text-[10px] font-normal normal-case text-muted-foreground"
    >
      <span className="num font-semibold text-foreground">{total}</span>
      <span className="mx-1 opacity-60">·</span>
      <span className="num text-sev-good">{avail} AVAIL</span>
    </span>
  );
}

function StatusBadge({
  status,
  reason,
  className = "",
}: {
  status: KpiStatus;
  reason: string | null;
  className?: string;
}) {
  return (
    <span
      title={reason ?? undefined}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

type FlatEntry = {
  techno: string;
  family: string;
  item: KpiCatalogItem;
};

// -----------------------------------------------------------------------
// 1.17.3 — FilterChip robuste.
// Spec : actif ⇐ `available === true` OU `values.length > 0`.
//        grisé sinon, tooltip porte `reason`.
// Un `dim` inconnu / forme inattendue → chip grisé « forme inattendue »
// jamais crash.
// -----------------------------------------------------------------------
type FilterDim = {
  available?: boolean | undefined;
  reason?: string | null | undefined;
  values?: string[] | undefined;
} | undefined;

function FilterChip({
  label,
  dim,
  value,
  onChange,
  malformed,
}: {
  label: string;
  dim: FilterDim;
  value: string[];
  onChange: (v: string[]) => void;
  malformed?: boolean;
}) {
  if (malformed) {
    return (
      <span
        title={`${label} — forme inattendue dans la réponse back (champ ignoré)`}
        className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-sev-warn/60 bg-sev-warn/5 px-2 text-[11px] text-sev-warn"
      >
        {label} <span className="opacity-70">·forme?</span>
      </span>
    );
  }
  const values = Array.isArray(dim?.values) ? dim!.values! : [];
  const active = dim?.available === true || values.length > 0;
  if (!active) {
    const reason = dim?.reason ?? "dimension indisponible pour ce projet";
    return (
      <span
        title={`${label} — ${reason}`}
        className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-[#E2E8F0] bg-muted/30 px-2 text-[11px] text-muted-foreground opacity-70"
      >
        {label}
      </span>
    );
  }
  if (values.length === 0) {
    return (
      <span
        title={`${label} — disponible mais aucune valeur à sélectionner`}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E2E8F0] bg-background px-2 text-[11px] text-muted-foreground"
      >
        {label}
      </span>
    );
  }
  return (
    <MultiSelect label={label} options={values} value={value} onChange={onChange} />
  );
}

// 1.17.3 — Liste CONSTANTE des dimensions attendues côté front.
// La barre est rendue à partir de CETTE liste, pas de la réponse.
// Une dim absente → chip grisé « forme inattendue ». Permet de garantir
// que la barre existe TOUJOURS, même si le back change de contrat.
const EXPECTED_FILTER_DIMS: ReadonlyArray<{
  key: keyof NonNullable<unknown>;
  label: string;
  stateKey: string;
}> = [
  { key: "operators" as never,     label: "Opérateur",     stateKey: "op" },
  { key: "rats" as never,          label: "Techno",        stateKey: "tech" },
  { key: "bands" as never,         label: "Bande",         stateKey: "band" },
  { key: "service_types" as never, label: "Service",       stateKey: "svc" },
  { key: "envs" as never,          label: "Environnement", stateKey: "env" },
  { key: "dr" as never,            label: "DR",            stateKey: "dr" },
  { key: "plaque" as never,        label: "Plaque",        stateKey: "plaque" },
  { key: "dor" as never,           label: "DOR",           stateKey: "dor" },
  { key: "arcep" as never,         label: "Zone ARCEP",    stateKey: "arcep" },
  { key: "commune" as never,       label: "Commune",       stateKey: "commune" },
  { key: "insee" as never,         label: "INSEE",         stateKey: "insee" },
];

// Error boundary dédié à la barre de filtres : une exception à l'intérieur
// n'enlève jamais la barre, elle rend un chip d'erreur et laisse le reste
// de la page fonctionner.
class FilterBarErrorBoundary extends Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  override state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  override componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("FilterBarErrorBoundary:", err, info?.componentStack);
  }
  override render() {
    if (this.state.err) {
      return (
        <div className="panel flex flex-wrap items-center gap-1.5 px-2 py-1.5">
          <h2 className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-sev-bad">
            Filtres
          </h2>
          <span
            title={this.state.err.message}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-sev-bad/60 bg-sev-bad/5 px-2 text-[11px] text-sev-bad"
          >
            Barre indisponible — {this.state.err.message.slice(0, 80)}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

// -----------------------------------------------------------------------
// 1.17.1 — Segmented control pour group_by (Opérateur | Bande | Les deux)
// -----------------------------------------------------------------------
type GroupBy = "operator" | "band" | "operator_band";
function GroupBySegmented({
  value,
  onChange,
}: {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}) {
  const Btn = ({ k, label }: { k: GroupBy; label: string }) => (
    <button
      onClick={() => onChange(k)}
      aria-pressed={value === k}
      className={`h-7 px-2.5 text-[12px] font-medium transition-colors ${
        value === k
          ? "bg-primary text-primary-foreground"
          : "bg-background text-foreground hover:bg-[#F1F5F9]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="radiogroup"
      aria-label="Agrégation"
      className="inline-flex overflow-hidden rounded-md border border-[#E2E8F0]"
    >
      <Btn k="operator" label="Opérateur" />
      <Btn k="band" label="Bande" />
      <Btn k="operator_band" label="Les deux" />
    </div>
  );
}

// -----------------------------------------------------------------------
// Composants sidebar
// -----------------------------------------------------------------------

/** Puce de statut compacte (sidebar). Évite les grandes « chips » que
 *  la spec interdit. Couleurs cohérentes avec le badge plein usage
 *  (vert/ambre/muted/rouge). Tooltip porte le reason. */
const DOT_COLORS: Record<KpiStatus, string> = {
  AVAILABLE: "bg-sev-good",
  PENDING: "bg-sev-warn",
  UNVALIDATED: "bg-muted-foreground/60",
  UNAVAILABLE: "bg-sev-bad",
  NOT_APPLICABLE: "bg-muted-foreground/40",
};

function LeafButton({
  item,
  isActive,
  onSelect,
}: {
  item: KpiCatalogItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  // Scroll into view when selection changes externally (keyboard nav, URL state).
  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [isActive]);
  const base =
    "flex w-full items-center gap-2 rounded-md py-[6px] pl-7 pr-2 text-left text-[13px]";
  const stateCls = isActive
    ? "bg-[#DBEAFE] font-semibold text-[#0759C7] border-l-2 border-[#0759C7] pl-[26px]"
    : "text-muted-foreground hover:bg-[#F1F5F9]";
  return (
    <button
      ref={ref}
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      title={`${item.name}${item.reason ? ` — ${item.reason}` : ""}`}
      className={`${base} ${stateCls}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLORS[item.status]}`}
        aria-label={`statut ${item.status}`}
      />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
    </button>
  );
}

/** Barre d'actions à droite du header KPI. Les 4 boutons sont des
 *  ACTIONS (pas des onglets) — ils agissent sur la zone d'analyse. */
function ActionButtons({
  canGraph,
  canMap,
  graphOn,
  onToggleGraph,
  onOpenInfo,
}: {
  canGraph: boolean;
  canMap: boolean;
  graphOn: boolean;
  onToggleGraph: () => void;
  onOpenInfo: () => void;
}) {
  const Btn = ({
    label,
    icon,
    primary,
    disabled,
    pressed,
    onClick,
    title,
  }: {
    label: string;
    icon: React.ReactNode;
    primary?: boolean;
    disabled?: boolean;
    pressed?: boolean;
    onClick?: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed ?? undefined}
      title={title ?? label}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : pressed
            ? "border-primary bg-primary/10 text-primary"
            : "border-[#E2E8F0] bg-background text-foreground hover:bg-[#F1F5F9]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      <Btn label="Histogramme" icon={<BarChart3 className="h-3.5 w-3.5" />} primary pressed />
      <Btn
        label="Graph"
        icon={<LineChart className="h-3.5 w-3.5" />}
        pressed={graphOn}
        disabled={!canGraph}
        onClick={onToggleGraph}
        title={canGraph ? "Afficher/masquer graphique secondaire" : "Pas de série secondaire disponible pour ce KPI"}
      />
      <Btn
        label="Carte"
        icon={<MapIcon className="h-3.5 w-3.5" />}
        disabled={!canMap}
        title="Pas de données géolocalisées disponibles"
      />
      <Btn label="Infos" icon={<Info className="h-3.5 w-3.5" />} onClick={onOpenInfo} />
    </div>
  );
}

/** La zone « Graph » (chart B Task Time) ne peut être « AVAILABLE » que
 *  si l'API renvoie suffisamment de signal. Le back 0.40.0 ne fournit
 *  pas de Task Time → on retourne false (bouton grisé, encart honnête
 *  dans la zone chart). */
function canShowGraph(_kpi: ProjectKpiDetail | undefined): boolean {
  // Contract gap déclaré (CHANGELOG 1.17.0) : /kpi/{code} ne renvoie pas
  // de série temporelle. Dès qu'un `trend` / `task_time` est câblé côté
  // back, remplacer par la condition de disponibilité réelle.
  return false;
}

function KpiPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? "";

  // 1.16.2 — version du back pour bandeau d'incompatibilité (jamais bloquant).
  const healthQ = useQuery({
    queryKey: ["back-health"],
    queryFn: ({ signal }) => getBackHealth(signal),
    staleTime: 30_000,
    retry: false,
  });

  const catalogQ = useQuery({
    queryKey: ["project-kpi", "catalog", projectId],
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getProjectKpiCatalog(projectId, signal),
  });
  const filtersQ = useQuery({
    queryKey: ["project-kpi", "filters", projectId],
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getProjectKpiFilters(projectId, signal),
  });

  const { filters, set: setFilters } = useFilters();
  type Filt = typeof filters;
  const uiFilters = filters as Filt & { svc?: string[]; env?: string[] };

  const [graphVisible, setGraphVisible] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("operator");

  // 1.17.0 — URL state : `?kpi=<code>` persiste la sélection de KPI
  // (refresh, partage de lien). Le code est le seul identifiant canonique
  // du catalogue v2. On ne persiste QUE le code — les filtres sont déjà
  // persistés par `useFilters()`.
  const urlSearch = useSearch({ strict: false }) as { kpi?: string | undefined };
  const navigate = useNavigate();
  const codeFromUrl = urlSearch.kpi ?? null;
  const [selectedCodeLocal, setSelectedCodeLocal] = useState<string | null>(null);
  const selectedCode = selectedCodeLocal ?? codeFromUrl;
  const setSelectedCode = (code: string | null) => {
    setSelectedCodeLocal(code);
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (code) {
          next["kpi"] = code;
        } else {
          delete next["kpi"];
        }
        return next;
      },
      replace: true,
    } as never);
  };
  const [openTechno, setOpenTechno] = useState<string | null>(null);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Flatten tree (techno → family → kpi) into a list for search + default-code.
  const flat: FlatEntry[] = useMemo(() => {
    const out: FlatEntry[] = [];
    for (const t of catalogQ.data?.tree ?? []) {
      for (const f of t.families) {
        for (const k of f.kpis) {
          out.push({ techno: t.techno, family: f.family, item: k });
        }
      }
    }
    return out;
  }, [catalogQ.data]);

  const defaultCode = useMemo<string | null>(() => {
    const avail = flat.find((e) => e.item.status === "AVAILABLE");
    if (avail) return avail.item.code;
    return flat[0]?.item.code ?? null;
  }, [flat]);

  const activeCode = selectedCode ?? defaultCode;

  // Determine the techno + family that CONTAIN the active KPI (for breadcrumb
  // + default-open accordion state).
  const activeEntry = flat.find((e) => e.item.code === activeCode);
  const effectiveOpenTechno = openTechno ?? activeEntry?.techno ?? catalogQ.data?.tree[0]?.techno ?? null;
  const effectiveOpenFamily = openFamily ?? activeEntry?.family ?? null;

  const filterPayload = useMemo(
    () => ({
      operator: uiFilters.op ?? [],
      service_type: uiFilters.svc ?? [],
      phase: [] as string[],
      band: uiFilters.band ?? [],
      rat: uiFilters.tech ?? [],
      env: uiFilters.env ?? [],
      dep: uiFilters.dep ?? [],
      dr: (uiFilters as unknown as { dr?: string[] }).dr ?? [],
      plaque: (uiFilters as unknown as { plaque?: string[] }).plaque ?? [],
      dor: (uiFilters as unknown as { dor?: string[] }).dor ?? [],
      arcep: uiFilters.arcep ?? [],
      commune: (uiFilters as unknown as { commune?: string[] }).commune ?? [],
      insee: (uiFilters as unknown as { insee?: string[] }).insee ?? [],
      group_by: groupBy,
    }),
    [
      uiFilters.op,
      uiFilters.svc,
      uiFilters.band,
      uiFilters.tech,
      uiFilters.env,
      uiFilters.dep,
      uiFilters.arcep,
      uiFilters,
      groupBy,
    ],
  );

  const kpiQ = useQuery<ProjectKpiDetail>({
    queryKey: ["project-kpi", "detail", projectId, activeCode, filterPayload],
    enabled: Boolean(projectId && activeCode),
    queryFn: ({ signal }) =>
      getProjectKpi(projectId, activeCode as string, filterPayload, signal),
  });

  const activeFilterCount = useMemo(() => {
    const keys = ["op", "tech", "band", "svc", "env"] as const;
    let n = 0;
    for (const k of keys) {
      const v = (uiFilters as Record<string, unknown>)[k];
      if (Array.isArray(v)) n += v.length;
    }
    return n;
  }, [uiFilters]);

  const clearFilters = () =>
    setFilters({
      op: undefined,
      tech: undefined,
      band: undefined,
      svc: undefined,
      env: undefined,
    } as unknown as Partial<typeof filters>);

  // ------------------------------------------------------------
  // États explicites (1.16.1) : loading / erreur / vide / OK.
  // ------------------------------------------------------------
  if (!activeProject) return <NoActiveProject scope="KPI Analytics" />;

  if (catalogQ.isLoading) {
    return (
      <div className="p-4">
        <LoadingSkeleton className="h-96" />
      </div>
    );
  }

  if (catalogQ.error) {
    const cls = classifyKpiError(catalogQ.error);
    const err = catalogQ.error;
    // 1.16.2 — Pour une incompatibilité de contrat, afficher
    // explicitement les deux versions : celle lue dans le payload
    // non-conforme (`catalog_version`, portée par l'erreur typée) ET
    // celle rapportée par /health du back. Jamais confondues.
    const extraLine =
      err instanceof KpiContractMismatchError
        ? `catalog_version lue: ${err.backVersion ?? "N/D"}  ·  /health version: ${healthQ.data?.version ?? "N/D"}`
        : null;
    return (
      <div className="p-4">
        <KpiErrorBanner
          title={cls.title}
          message={cls.message}
          details={[extraLine, cls.details].filter(Boolean).join("\n")}
          tone={cls.tone}
          onRetry={() => {
            void catalogQ.refetch();
            void healthQ.refetch();
          }}
        />
      </div>
    );
  }

  const catalog = catalogQ.data;
  if (!catalog) {
    return (
      <div className="p-4">
        <KpiErrorBanner
          title="Catalogue KPI vide"
          message="Aucune donnée catalogue reçue du backend."
          tone="warn"
          onRetry={() => {
            void catalogQ.refetch();
          }}
        />
      </div>
    );
  }

  const totalKpis = flat.length;
  if (totalKpis === 0) {
    return (
      <div className="p-4">
        <KpiErrorBanner
          title="Projet sans catalogue KPI"
          message={`Le catalogue v${catalog.catalog_version} ne contient aucun KPI pour ce projet. Vérifier l'import xlsx côté back.`}
          tone="warn"
        />
      </div>
    );
  }

  const filtersData = filtersQ.data;
  const kpi = kpiQ.data;
  const activeItem = activeEntry?.item;
  const kpiErrorCls = kpiQ.error ? classifyKpiError(kpiQ.error) : null;

  const buildByOperator = (c: { muted: string; border: string }): EChartsOption => {
      const rows = kpi?.by_operator ?? [];
      // Pour un KPI "Compteur", la grandeur affichée est `n` ; pour une
      // distribution, c'est `value`. On choisit par présence.
      const useValue = rows.some((r) => r.value != null);
      return {
        grid: { left: 48, right: 10, top: 24, bottom: 36 },
        tooltip: { trigger: "axis" as const, confine: true },
        xAxis: {
          type: "category" as const,
          data: rows.map((r) => opLabel(r.operator)),
          axisLabel: { color: c.muted, fontSize: 11 },
          axisLine: { lineStyle: { color: c.border } },
        },
        yAxis: {
          type: "value" as const,
          scale: true,
          axisLabel: { color: c.muted, fontSize: 10 },
          splitLine: { lineStyle: { color: c.border } },
          name: useValue ? (kpi?.unit ?? "") : "occurrences",
          nameTextStyle: { color: c.muted, fontSize: 10 },
        },
        series: [
          {
            type: "bar" as const,
            barWidth: "62%",
            label: {
              show: true,
              position: "top" as const,
              fontSize: 11,
              fontWeight: "bold" as const,
              formatter: (p: { value?: unknown }) =>
                p.value === null || p.value === undefined
                  ? "N/D"
                  : useValue
                    ? nd(Number(p.value))
                    : fri(Number(p.value)),
            },
            data: rows.map((r) => ({
              value: useValue ? r.value : r.n,
              itemStyle: { color: opColor(r.operator) },
            })),
          },
        ],
      };
  };

  // Filtre catalogue par recherche textuelle (sur name et code).
  const needle = search.trim().toLowerCase();
  const filteredTree = sortTechnoRoots(
    (catalog.tree ?? []).map((t) => ({
      techno: t.techno,
      families: t.families
        .map((f) => ({
          family: f.family,
          // 1.17.0 — Match CONTENT : code, name, OU techno OU family racine.
          // Les ancêtres sont « étirés » (expand sur match) via la logique
          // d'ouverture automatique en bas.
          kpis: needle
            ? f.kpis.filter(
                (k) =>
                  k.name.toLowerCase().includes(needle) ||
                  k.code.toLowerCase().includes(needle) ||
                  t.techno.toLowerCase().includes(needle) ||
                  f.family.toLowerCase().includes(needle),
              )
            : f.kpis,
        }))
        .filter((f) => f.kpis.length > 0 || !needle),
    })),
  );

  const valueText =
    kpi?.status === "AVAILABLE"
      ? kpi.value != null
        ? nd(kpi.value, 2)
        : fri(kpi.n ?? null)
      : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 1.17.3 — Barre rendue depuis EXPECTED_FILTER_DIMS (constante
          front), JAMAIS depuis la réponse back. Error boundary autour :
          une exception dans FilterBar n'enlève pas la barre, elle rend
          un chip d'erreur. `filtersQ.error` → bandeau rouge visible (le
          console.error est déjà émis par kpiFetch — jamais silencieux). */}
      <FilterBarErrorBoundary>
        <div className="panel flex flex-wrap items-center gap-1.5 px-2 py-1.5">
          <h2 className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filtres
          </h2>
          {filtersQ.error ? (
            <span
              title={String((filtersQ.error as Error).message ?? "")}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-sev-bad/60 bg-sev-bad/5 px-2 text-[11px] text-sev-bad"
            >
              <AlertTriangle className="h-3 w-3" />
              Filtres indisponibles — {String((filtersQ.error as Error).message ?? "").slice(0, 80)}
            </span>
          ) : null}
          {EXPECTED_FILTER_DIMS.map(({ key, label, stateKey }) => {
            const dim = (filtersData as unknown as Record<string, unknown> | undefined)?.[key as unknown as string];
            // 1.17.3 — "forme inattendue" couvre DEUX cas :
            //   - dim absente alors que `filtersData` est bien chargée
            //     (back a répondu 200 mais la clé n'existe pas → contrat KO)
            //   - dim présente mais sans `available` ni `values`.
            // Pendant le chargement (`filtersData === undefined`) on NE
            // marque PAS malformed : le chip est juste grisé "indisponible".
            const loaded = filtersData !== undefined && filtersData !== null;
            const malformed = loaded && (
              dim === undefined ||
              dim === null ||
              (typeof dim === "object" &&
                !("available" in (dim as object)) &&
                !("values" in (dim as object)))
            );
            if (malformed) {
              // eslint-disable-next-line no-console
              console.error(`[FilterBar] dim '${String(key)}' forme inattendue`, dim);
            }
            const uiValue =
              ((uiFilters as unknown as Record<string, unknown>)[stateKey] as string[] | undefined) ?? [];
            return (
              <FilterChip
                key={String(key)}
                label={label}
                dim={dim as FilterDim}
                value={uiValue}
                onChange={(v) => setFilters({ [stateKey]: v } as never)}
                malformed={malformed}
              />
            );
          })}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-muted"
            >
              <X className="h-3 w-3" /> Effacer ({activeFilterCount})
            </button>
          )}
        </div>
      </FilterBarErrorBoundary>

      <div className="grid gap-3 xl:grid-cols-[320px_1fr]">
        {/* Catalogue — techno → famille → KPI. */}
        <aside
          className="max-h-[calc(100vh-180px)] overflow-y-auto rounded-[10px] border border-[#E2E8F0] bg-card p-[14px]"
          aria-label="Catalogue KPI"
          onKeyDown={(e) => {
            // Keyboard nav : ArrowUp / ArrowDown parcourt la liste
            // des feuilles filtrées (search-aware, ordre canonique).
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const leaves = flat.map((f) => f.item.code);
            if (!leaves.length) return;
            const idx = selectedCode ? leaves.indexOf(selectedCode) : -1;
            const next =
              e.key === "ArrowDown"
                ? idx < 0
                  ? 0
                  : Math.min(leaves.length - 1, idx + 1)
                : idx <= 0
                  ? 0
                  : idx - 1;
            setSelectedCode(leaves[next]!);
          }}
          tabIndex={0}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-[15px] font-semibold">Catalogue KPI</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            v{catalog.catalog_version}
            {catalog.canonical_count !== undefined
              ? ` · ${catalog.canonical_count} KPI`
              : ""}
            {" · "}
            {(catalog.tree ?? []).length} technos
          </p>
          <label className="relative mt-3 block">
            <Search className="absolute left-2.5 top-[11px] h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un KPI…"
              className="h-9 w-full rounded-md border border-[#E2E8F0] bg-background pl-8 pr-2 text-[13px]"
              aria-label="Rechercher un KPI"
            />
          </label>
          <ul className="mt-3 space-y-0.5">
            {filteredTree.map((t) => {
              const isTechOpen = effectiveOpenTechno === t.techno;
              return (
                <li key={t.techno}>
                  <button
                    onClick={() =>
                      setOpenTechno((o) => (o === t.techno ? null : t.techno))
                    }
                    className="flex w-full items-center gap-1 rounded bg-muted/30 px-1 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-muted"
                  >
                    {isTechOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {technoLabel(t.techno)}
                    {/* 1.16.2 — Compteurs tirés de `counts_by_techno`
                        côté back. Jamais recalculés : la somme des
                        4 statuts est additionnée directement depuis les
                        valeurs renvoyées (si un statut manque, il vaut 0
                        côté back par convention). */}
                    <TechnoBadge
                      techno={t.techno}
                      counts={catalog.counts_by_techno?.[t.techno]}
                    />
                  </button>
                  {isTechOpen &&
                    t.families.map((fam) => {
                      const isFamOpen = effectiveOpenFamily === fam.family;
                      return (
                        <div key={fam.family} className="ml-3">
                          <button
                            onClick={() =>
                              setOpenFamily((o) =>
                                o === fam.family ? null : fam.family,
                              )
                            }
                            className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs font-semibold hover:bg-muted"
                          >
                            {isFamOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <span className="truncate">{fam.family}</span>
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                              {fam.kpis.length}
                            </span>
                          </button>
                          {isFamOpen &&
                            fam.kpis.map((item) => {
                              const isActive = item.code === activeCode;
                              return (
                                <LeafButton
                                  key={item.code}
                                  item={item}
                                  isActive={isActive}
                                  onSelect={() => setSelectedCode(item.code)}
                                />
                              );
                            })}
                        </div>
                      );
                    })}
                </li>
              );
            })}
          </ul>
          {/* 1.17.1 — Version front visible à l'écran (pied de sidebar). */}
          <div className="mt-3 border-t border-[#E2E8F0] pt-2 text-[10px] text-muted-foreground">
            <span>front v{APP_VERSION}</span>
            {healthQ.data?.version && (
              <>
                <span className="mx-1">·</span>
                <span>back v{healthQ.data.version}</span>
              </>
            )}
          </div>
        </aside>

        {/* Section KPI actif */}
        <section className="panel p-5">
          {kpiErrorCls && activeItem ? (
            <KpiErrorBanner
              title={kpiErrorCls.title}
              message={kpiErrorCls.message}
              details={kpiErrorCls.details}
              tone={kpiErrorCls.tone}
              onRetry={() => {
                void kpiQ.refetch();
              }}
            />
          ) : !activeItem || !activeEntry ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Sélectionnez un KPI dans le catalogue.
            </div>
          ) : (
            <>
              {/* 1.17.0 — Header KPI compact (~76px) : icône + nom + badge
                  + méta ligne + 4 boutons ACTIONS (Histogramme | Graph |
                  Carte | Infos). Ces boutons ne sont PAS des onglets de
                  page — ils agissent sur la zone d'analyse ci-dessous. */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                      aria-hidden="true"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <h1 className="text-[21px] font-semibold leading-tight">
                      {activeItem.name}
                    </h1>
                    <StatusBadge
                      status={activeItem.status}
                      reason={activeItem.reason}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <span className="font-mono">{activeItem.code}</span>
                    {" · "}
                    {activeItem.nature}
                    {" · "}
                    {dash(activeItem.unit)}
                    {" · "}
                    <span className="truncate">{dash(activeItem.source)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <ActionButtons
                    canGraph={canShowGraph(kpi)}
                    canMap={false}
                    graphOn={graphVisible}
                    onToggleGraph={() => setGraphVisible((v) => !v)}
                    onOpenInfo={() => setInfoOpen(true)}
                  />
                  {/* 1.17.1 — Segmented control d'agrégation (operator |
                      band | operator_band) côte à côte avec les actions. */}
                  <GroupBySegmented value={groupBy} onChange={setGroupBy} />
                </div>
              </div>
              {activeItem.aliases && activeItem.aliases.length > 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  <strong>Alias :</strong> {activeItem.aliases.join(", ")}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                <strong>Formule :</strong> {dash(activeItem.formula)}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                <strong>Source :</strong> {dash(activeItem.source)}
                {" — "}
                <strong>Formule :</strong> {dash(activeItem.formula)}
              </p>

              {activeItem.status !== "AVAILABLE" ? (
                <div
                  className={`mt-4 rounded-md border border-dashed p-6 text-sm ${
                    activeItem.status === "PENDING"
                      ? "border-sev-warn/40 bg-sev-warn/5"
                      : activeItem.status === "UNVALIDATED"
                        ? "border-muted-foreground/30 bg-muted/30"
                        : "border-sev-bad/40 bg-sev-bad/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={activeItem.status}
                      reason={activeItem.reason}
                    />
                    <strong className="text-sm">Aucun chiffre servi</strong>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {activeItem.reason ?? "raison non renseignée"}
                  </p>
                </div>
              ) : kpiQ.isLoading || !kpi ? (
                <div className="mt-4">
                  <LoadingSkeleton className="h-24" />
                </div>
              ) : (
                <>
                  {/* 1.17.0 — Deux cartes charts côte à côte au-dessus
                      de la table. `xl:grid-cols-2` reste côte à côte
                      ≥ 1280 px ; stack sinon. */}
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {/* Chart A — Occurrences par opérateur */}
                    <div className="rounded-[12px] border border-[#E2E8F0] bg-card p-3">
                      {(kpi.by_operator ?? []).length > 0 ? (
                        <Chart
                          title="Occurrences par opérateur"
                          build={buildByOperator}
                          height={310}
                          exportName={`kpi_${kpi.code}_operateurs`}
                        />
                      ) : (
                        <EmptyChart
                          title="Occurrences par opérateur"
                          reason="Aucun opérateur observé pour les filtres actuels."
                        />
                      )}
                    </div>
                    {/* Chart B — Graph (Task Time) : empty state honnête
                        tant que /kpi/{code} ne renvoie pas de série
                        temporelle (contract gap 1.17.0). */}
                    <div className="rounded-[12px] border border-[#E2E8F0] bg-card p-3">
                      <EmptyChart
                        title="RSRP LTE / NR par Task Time"
                        reason={
                          graphVisible
                            ? "Graphique Task Time indisponible : /kpi/{code} ne renvoie ni trend ni task_time dans la version 0.40.0 du back. Déclaré en contract gap, pas de courbe inventée."
                            : "Secondaire désactivée. Activer avec le bouton « Graph »."
                        }
                      />
                    </div>
                  </div>

                  {/* Détail des valeurs — pleine largeur */}
                  <KpiDetailTable kpi={kpi} groupBy={groupBy} />
                </>
              )}
            </>
          )}
        </section>
      </div>
      {/* Drawer Infos (ouvert au clic sur le bouton « Infos ») */}
      <KpiInfoSheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        activeItem={activeItem ?? null}
        activeEntry={activeEntry ?? null}
        kpi={kpi ?? null}
      />
    </div>
  );
}

// -----------------------------------------------------------------------
// Chart vide (empty state honnête, jamais une courbe fabriquée)
// -----------------------------------------------------------------------

function EmptyChart({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="flex h-[310px] flex-col">
      <div className="mb-2 flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
        <strong className="text-[13px]">{title}</strong>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[#E2E8F0] p-6 text-center text-[12px] text-muted-foreground">
        {reason}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Table « Détail des valeurs » — colonnes dynamiques depuis by_operator
// -----------------------------------------------------------------------

function KpiDetailTable({
  kpi,
  groupBy,
}: {
  kpi: ProjectKpiDetail;
  groupBy: GroupBy;
}) {
  // 1.17.1 — Trois vues :
  //   - group_by=operator      → flat (by_operator legacy ou groups).
  //   - group_by=band          → flat par bande (groups).
  //   - group_by=operator_band → matrix opérateur × bande (groups).
  if (groupBy === "operator_band") {
    return <MatrixOperatorBand kpi={kpi} />;
  }
  const groupRows: KpiGroupRow[] = kpi.groups ?? kpi.table ?? [];
  const srcRows: KpiGroupRow[] = groupRows.length > 0
    ? groupRows
    : (kpi.by_operator ?? []).map(
        (r): KpiGroupRow => ({ operator: r.operator ?? null, n: r.n ?? 0 }),
      );
  const rows = srcRows.map((r) => ({
    label:
      groupBy === "band"
        ? (r.band ?? null) as string | null
        : (r.operator ?? null) as string | null,
    n: r.n ?? 0,
    p50: (r.p50 ?? null) as number | null,
  }));
  const total = rows.reduce((a, r) => a + r.n, 0);
  const [sort, setSort] = useState<{ key: "lbl" | "n"; dir: "asc" | "desc" }>({
    key: "n",
    dir: "desc",
  });
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "lbl") {
        cmp = opLabel(a.label).localeCompare(opLabel(b.label), "fr");
      } else {
        cmp = a.n - b.n;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const toggleSort = (key: "lbl" | "n") =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );

  const dimLabel = groupBy === "band" ? "Bande" : "Opérateur";
  const onExport = () => {
    const header = [dimLabel, "Occurrences", "% du total"];
    const body = sorted.map((r) => [
      opLabel(r.label),
      r.n,
      total > 0 ? `${((100 * r.n) / total).toFixed(1).replace(".", ",")} %` : "N/D",
    ]);
    downloadCsv(`kpi_${kpi.code}_detail`, [header, ...body]);
  };

  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-[12px] border border-dashed border-[#E2E8F0] p-6 text-center text-[12px] text-muted-foreground">
        Pas de ventilation par {dimLabel.toLowerCase()} pour ce KPI.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[12px] border border-[#E2E8F0] bg-card">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
        <strong className="text-[13px]">
          Détail des valeurs — par {dimLabel.toLowerCase()}
        </strong>
        <button
          onClick={onExport}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E2E8F0] px-2 text-[11px] text-muted-foreground hover:bg-[#F1F5F9]"
          title="Export CSV"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("lbl")}>
              {dimLabel}
              {sort.key === "lbl" ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right"
              onClick={() => toggleSort("n")}
            >
              Occurrences
              {sort.key === "n" ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
            </th>
            <th className="px-3 py-2 text-right">% du total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={opLabel(r.label)}
              className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]"
            >
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  {groupBy === "operator" && (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: opColor(r.label) }}
                      aria-hidden="true"
                    />
                  )}
                  <span>{opLabel(r.label)}</span>
                </span>
              </td>
              <td className="num px-3 py-2 text-right font-mono">{fri(r.n)}</td>
              <td className="num px-3 py-2 text-right font-mono">
                {total > 0 ? ((100 * r.n) / total).toFixed(1).replace(".", ",") + " %" : "N/D"}
              </td>
            </tr>
          ))}
          {total > 0 && (
            <tr className="border-t border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="num px-3 py-2 text-right font-mono">{fri(total)}</td>
              <td className="num px-3 py-2 text-right font-mono">100,0 %</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------
// 1.17.1 — Matrix opérateur × bande (group_by=operator_band).
// Cellule : `n` + `p50` quand nature=distribution. Lignes/colonnes
// incluent la clé « N/D » quand le back la renvoie.
// -----------------------------------------------------------------------
function MatrixOperatorBand({ kpi }: { kpi: ProjectKpiDetail }) {
  const rows = kpi.groups ?? kpi.table ?? [];
  const operators = Array.from(
    new Set(rows.map((r) => r.operator ?? "N/D")),
  ).sort((a, b) => {
    if (a === "N/D") return 1;
    if (b === "N/D") return -1;
    return a.localeCompare(b, "fr");
  });
  const bands = Array.from(new Set(rows.map((r) => r.band ?? "N/D"))).sort(
    (a, b) => {
      if (a === "N/D") return 1;
      if (b === "N/D") return -1;
      return a.localeCompare(b, "fr");
    },
  );
  const cell = (op: string, band: string) =>
    rows.find(
      (r) => (r.operator ?? "N/D") === op && (r.band ?? "N/D") === band,
    );
  const total = rows.reduce((a, r) => a + (r.n ?? 0), 0);
  const hasP50 = rows.some((r) => (r.p50 ?? null) != null);

  const onExport = () => {
    const header = ["Opérateur \\ Bande", ...bands];
    const body = operators.map((op) => [
      op,
      ...bands.map((b) => {
        const c = cell(op, b);
        if (!c) return "";
        return hasP50 && c.p50 != null ? `${c.p50} dBm (n=${c.n})` : String(c.n);
      }),
    ]);
    downloadCsv(`kpi_${kpi.code}_operator_x_band`, [header, ...body]);
  };

  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-[12px] border border-dashed border-[#E2E8F0] p-6 text-center text-[12px] text-muted-foreground">
        Aucune ventilation opérateur × bande renvoyée par le back.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[12px] border border-[#E2E8F0] bg-card">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
        <strong className="text-[13px]">
          Détail des valeurs — opérateur × bande
          {hasP50 ? " (P50 dBm · n)" : " (n)"}
        </strong>
        <button
          onClick={onExport}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E2E8F0] px-2 text-[11px] text-muted-foreground hover:bg-[#F1F5F9]"
          title="Export CSV"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Opérateur \ Bande</th>
              {bands.map((b) => (
                <th
                  key={b}
                  className={`px-3 py-2 text-right ${b === "N/D" ? "text-muted-foreground" : ""}`}
                >
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr
                key={op}
                className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]"
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {op !== "N/D" && (
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: opColor(op) }}
                        aria-hidden="true"
                      />
                    )}
                    <span className={op === "N/D" ? "text-muted-foreground" : ""}>
                      {op}
                    </span>
                  </span>
                </td>
                {bands.map((b) => {
                  const c = cell(op, b);
                  if (!c) {
                    return (
                      <td
                        key={b}
                        className="px-3 py-2 text-right font-mono text-muted-foreground"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={b}
                      className="num px-3 py-2 text-right font-mono"
                      title={`n=${c.n}${c.p10 != null ? ` · p10=${c.p10}` : ""}${c.p50 != null ? ` · p50=${c.p50}` : ""}${c.p90 != null ? ` · p90=${c.p90}` : ""}`}
                    >
                      {hasP50 && c.p50 != null ? (
                        <>
                          <span>{nd(c.p50, 1)}</span>
                          <span className="ml-1 text-muted-foreground">
                            ({fri(c.n)})
                          </span>
                        </>
                      ) : (
                        fri(c.n)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {total > 0 && (
              <tr className="border-t border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                <td className="px-3 py-2">Total</td>
                {bands.map((b) => {
                  const nb = rows
                    .filter((r) => (r.band ?? "N/D") === b)
                    .reduce((a, r) => a + (r.n ?? 0), 0);
                  return (
                    <td key={b} className="num px-3 py-2 text-right font-mono">
                      {fri(nb)}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Drawer « Infos » (Sheet shadcn) — source / formule / aliases / scope
// -----------------------------------------------------------------------

function KpiInfoSheet({
  open,
  onOpenChange,
  activeItem,
  activeEntry,
  kpi,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeItem: KpiCatalogItem | null;
  activeEntry: FlatEntry | null;
  kpi: ProjectKpiDetail | null;
}) {
  if (!activeItem) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Aucun KPI sélectionné</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{activeItem.name}</SheetTitle>
          <SheetDescription>
            <span className="font-mono">{activeItem.code}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-[12px]">
          <Row label="Techno" value={activeEntry ? technoLabel(activeEntry.techno) : "—"} />
          <Row label="Famille" value={activeEntry?.family ?? "—"} />
          <Row label="Nature" value={activeItem.nature} />
          <Row label="Unité" value={dash(activeItem.unit)} />
          <Row label="Statut" value={activeItem.status} />
          {activeItem.reason && <Row label="Raison" value={activeItem.reason} />}
          <Row label="Source" value={dash(activeItem.source)} />
          <Row label="Formule" value={dash(activeItem.formula)} multiline />
          {activeItem.aliases && activeItem.aliases.length > 0 && (
            <Row label="Alias" value={activeItem.aliases.join(", ")} />
          )}
          {activeItem.service_scope && activeItem.service_scope.length > 0 && (
            <Row label="Service scope" value={activeItem.service_scope.join(", ")} />
          )}
          {kpi && (
            <>
              <Row label="Valeur" value={kpi.value == null ? "N/D" : nd(kpi.value)} />
              <Row label="Occurrences" value={fri(kpi.n ?? null)} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <div className="text-muted-foreground">{label}</div>
      <div className={multiline ? "whitespace-pre-wrap" : "truncate"}>{value}</div>
    </div>
  );
}
