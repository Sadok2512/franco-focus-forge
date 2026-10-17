// bc4-front — Dict v2 : coque visuelle IDENTIQUE à main/DictionaryPage
// (toolbar + Panel + ResizablePanelGroup). Seuls le contenu du panneau
// gauche (TreePanel : onglets Paramètres | Raw + arbre hiérarchique) et
// du panneau droit (ValueExplorer : charts v2 + table + CSV) sont
// nouveaux. Pas de restyle : classes, hiérarchie DOM, boutons, chevrons
// identiques à main. Export `DictionaryPage` → le route importe le
// module sans toucher au reste de _app.rrc.tsx.

import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Folder,
  Info,
  Map as MapIcon,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { EmptyState, LoadingSkeleton } from "@/components/bc4/States";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { DictFilters } from "@/lib/api/client";
import type { Operator } from "@/lib/api/schemas";
import { dictQ } from "@/features/dictionary/shared";
import {
  getDictDistribution,
  getDictTree,
  type DictLeaf,
  type GroupByMode,
} from "@/lib/api/dict-v2";
import { TreePanel } from "./TreePanel";
import { ValueExplorer } from "./ValueExplorer";
import { InfoDrawer } from "./InfoDrawer";

type Techno = "LTE" | "NR" | "LTE+NR";
type Draft = { techno: Techno; op: string[]; band: string[] };

// Même wrapper que main/DictionaryPage.tsx : classes IDENTIQUES — ne
// jamais retoucher sans réaligner main. (Dupliqué car non exporté par le
// module dictionary d'origine ; on garde la source byte-identique.)
function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
          {icon}
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function Seg<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-7 overflow-hidden rounded-md border"
    >
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 text-xs font-medium ${value === o.v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SelectBox<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  title?: string | undefined;
}) {
  return (
    <select
      aria-label={label}
      title={title}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 rounded-md border bg-card px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

const GROUP_LABELS: Record<GroupByMode, string> = {
  operator: "Opérateur",
  band: "Bande",
  operator_band: "Opérateur + Bande",
};

/* ----------------------------------------------------------------
 * Toolbar — mêmes contrôles / mêmes classes que main.
 * (Infos/Carte/Appliquer/Réinitialiser conservés visuellement ;
 * Carte est marqué disabled car dict/v2 n'expose pas d'endpoint map.)
 * ---------------------------------------------------------------- */

function Toolbar({
  draft,
  setDraft,
  operators,
  bands,
  period,
  geoLabel,
  groupBy,
  setGroupBy,
  showMap,
  infoOpen,
  setInfoOpen,
  setShowMap,
  dirty,
  onApply,
  onReset,
  compact,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  operators: string[];
  bands: string[];
  period: string | null;
  geoLabel: string | null;
  groupBy: GroupByMode;
  setGroupBy: (g: GroupByMode) => void;
  showMap: boolean;
  infoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
  setShowMap: (b: boolean) => void;
  dirty: boolean;
  onApply: () => void;
  onReset: () => void;
  compact: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const secondary = (
    <>
      <Labeled label="Zone géographique">
        <SelectBox
          label="Zone géographique"
          value="all"
          disabled
          title="Filtre géographique non pris en charge par l'API du dictionnaire (référentiel cellules vide)"
          options={[{ v: "all", l: geoLabel ? `${geoLabel} (toutes)` : "Toutes" }]}
          onChange={() => {}}
        />
      </Labeled>
      <Labeled label="Période">
        <span
          className="inline-flex h-7 items-center rounded-md border bg-muted/40 px-2 text-xs"
          title="Période du projet (filtre par période non pris en charge par l'API)"
        >
          {period ?? "N/D"}
        </span>
      </Labeled>
    </>
  );
  return (
    <div className="panel flex flex-wrap items-end gap-x-3 gap-y-2 px-3 py-2">
      <Labeled label="Technologie">
        <Seg
          label="Technologie"
          value={draft.techno}
          onChange={(t) => setDraft({ ...draft, techno: t })}
          options={[
            { v: "LTE", l: "LTE" },
            { v: "NR", l: "NR" },
            { v: "LTE+NR", l: "LTE + NR" },
          ]}
        />
      </Labeled>
      <Labeled label="Opérateur">
        <MultiSelect
          label="Opérateur"
          options={operators}
          value={draft.op}
          onChange={(v) => setDraft({ ...draft, op: v })}
        />
      </Labeled>
      <Labeled label="Bande">
        <MultiSelect
          label="Bande"
          options={bands}
          value={draft.band}
          onChange={(v) => setDraft({ ...draft, band: v })}
        />
      </Labeled>
      {compact ? (
        <button
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Plus de filtres
        </button>
      ) : (
        secondary
      )}
      <Labeled label="Regrouper par">
        <SelectBox
          label="Regrouper par"
          value={groupBy}
          onChange={setGroupBy}
          options={(Object.keys(GROUP_LABELS) as GroupByMode[]).map((v) => ({
            v,
            l: GROUP_LABELS[v],
          }))}
        />
      </Labeled>
      <button
        role="switch"
        aria-checked={infoOpen}
        onClick={() => setInfoOpen(!infoOpen)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${infoOpen ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted"}`}
      >
        <Info className="h-3.5 w-3.5" /> Infos
        <span
          className={`ml-1 inline-block h-3.5 w-6 rounded-full p-0.5 ${infoOpen ? "bg-primary" : "bg-muted-foreground/40"}`}
        >
          <span
            className={`block h-2.5 w-2.5 rounded-full bg-card transition-transform ${infoOpen ? "translate-x-2.5" : ""}`}
          />
        </span>
      </button>
      <button
        role="switch"
        aria-checked={showMap}
        onClick={() => setShowMap(!showMap)}
        disabled
        title="Carte non disponible dans l'explorateur de valeurs v2"
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${showMap ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted"}`}
      >
        <MapIcon className="h-3.5 w-3.5" /> Carte
        <span
          className={`ml-1 inline-block h-3.5 w-6 rounded-full p-0.5 ${showMap ? "bg-primary" : "bg-muted-foreground/40"}`}
        >
          <span
            className={`block h-2.5 w-2.5 rounded-full bg-card transition-transform ${showMap ? "translate-x-2.5" : ""}`}
          />
        </span>
      </button>
      <div className="ml-auto flex gap-2">
        <button
          onClick={onApply}
          disabled={!dirty}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Appliquer
        </button>
        <button
          onClick={onReset}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold text-primary hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
        </button>
      </div>
      {compact && advanced && (
        <div className="flex w-full flex-wrap gap-3 border-t pt-2">{secondary}</div>
      )}
    </div>
  );
}

function useWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/* ----------------------------------------------------------------
 * Page — même shape que main/DictionaryPage : {projectId, filters,
 * setFilters}. Export sous le nom `DictionaryPage` pour que la route
 * _app.rrc.tsx ne diff que l'import.
 * ---------------------------------------------------------------- */

export function DictionaryPage({
  projectId,
  filters,
  setFilters,
}: {
  projectId: string;
  filters: DictFilters;
  setFilters: (p: Partial<DictFilters>) => void;
}) {
  const width = useWidth();
  const compact = width < 1100;
  const [techno, setTechno] = useState<Techno>("LTE+NR");
  const [draft, setDraft] = useState<Draft>({
    techno: "LTE+NR",
    op: filters.op ?? [],
    band: filters.band ?? [],
  });
  const [groupBy, setGroupBy] = useState<GroupByMode>("operator");
  const [showMap, setShowMap] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [selected, setSelected] = useState<DictLeaf[]>([]);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  // Signal vers TreePanel pour qu'il replie à l'état initial +
  // vide sa recherche. Incrémenté par le bouton Réinitialiser.
  const [resetTick, setResetTick] = useState(0);
  const resetTree = () => {
    setSelected([]);
    setInfoKey(null);
    setResetTick((t) => t + 1);
  };

  useEffect(() => {
    setDraft((d) => ({ ...d, op: filters.op ?? [], band: filters.band ?? [] }));
  }, [filters.op, filters.band]);

  // Dimensions (opérateurs / bandes / période / geo_tree) via l'endpoint
  // partagé /dict/{project} — même source que main's Toolbar.
  const proj = useQuery(dictQ.project(projectId));
  const dims = proj.data?.dimensions;

  const dirty =
    draft.techno !== techno ||
    !same(draft.op, filters.op ?? []) ||
    !same(draft.band, filters.band ?? []);

  const apply = () => {
    setTechno(draft.techno);
    setFilters({ op: draft.op as Operator[], band: draft.band });
  };
  const reset = () => {
    setDraft({ techno: "LTE+NR", op: [], band: [] });
    setTechno("LTE+NR");
    setGroupBy("operator");
    setShowMap(false);
    setFilters({
      op: undefined,
      band: undefined,
      dr: undefined,
      plaque: undefined,
      arcep: undefined,
    });
  };

  // Deux arbres : catalog (défaut, onglet Paramètres) + raw (onglet Raw).
  const catalogQ = useQuery({
    queryKey: ["dict-v2", "tree", projectId, "catalog"],
    queryFn: ({ signal }) => getDictTree(projectId, "catalog", signal),
    enabled: !!projectId,
  });
  const rawQ = useQuery({
    queryKey: ["dict-v2", "tree", projectId, "raw"],
    queryFn: ({ signal }) => getDictTree(projectId, "raw", signal),
    enabled: !!projectId,
  });

  const selectedKeys = useMemo(() => selected.map((l) => l.param_key), [selected]);
  const distributionQ = useQuery({
    queryKey: ["dict-v2", "distribution", projectId, selectedKeys, groupBy],
    queryFn: ({ signal }) => getDictDistribution(projectId, selectedKeys, groupBy, signal),
    enabled: !!projectId && selectedKeys.length > 0,
  });

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const onToggle = (leaf: DictLeaf) => {
    setSelected((prev) => {
      const has = prev.some((p) => p.param_key === leaf.param_key);
      return has ? prev.filter((p) => p.param_key !== leaf.param_key) : [...prev, leaf];
    });
    setInfoKey(leaf.param_key);
  };

  const toolbar = (
    <Toolbar
      draft={draft}
      setDraft={setDraft}
      operators={dims?.operators ?? []}
      bands={dims?.bands ?? []}
      period={dims?.periods[0]?.replace("/", " → ") ?? null}
      geoLabel={dims?.geo_tree[0]?.label ?? null}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      showMap={showMap}
      infoOpen={infoOpen}
      setInfoOpen={setInfoOpen}
      setShowMap={setShowMap}
      dirty={dirty}
      onApply={apply}
      onReset={reset}
      compact={compact}
    />
  );

  const treeNode = (
    <TreePanel
      techno={techno}
      catalog={catalogQ.data ?? null}
      raw={rawQ.data ?? null}
      selected={selectedSet}
      onToggle={onToggle}
      onInfo={(leaf) => setInfoKey(leaf.param_key)}
      onReset={resetTree}
      resetTick={resetTick}
    />
  );

  const analysis =
    selectedKeys.length === 0 ? (
      <div className="panel h-full">
        <EmptyState title="Sélectionnez un paramètre">
          Choisissez un paramètre dans l'arbre pour afficher la distribution de ses valeurs.
        </EmptyState>
      </div>
    ) : catalogQ.isPending ? (
      <div className="flex flex-col gap-2">
        <LoadingSkeleton className="h-[340px]" />
        <LoadingSkeleton className="h-[260px]" />
      </div>
    ) : (
      <ValueExplorer
        distribution={distributionQ.data ?? null}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        isLoading={distributionQ.isLoading}
        error={distributionQ.error}
        selectedKeys={selectedKeys}
      />
    );

  const infoNode = (
    <Panel title="Infos" icon={<Info className="h-4 w-4" />} className="h-full">
      <InfoDrawer projectId={projectId} paramKey={infoKey} />
    </Panel>
  );

  const sideShown = infoOpen;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col gap-2 p-2">
      {toolbar}
      <ResizablePanelGroup
        key={sideShown ? "side" : "noside"}
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize="20%" minSize="14%" collapsible>
          <Panel
            title="Paramètres RRC"
            icon={<Folder className="h-4 w-4 text-primary" />}
            className="h-full"
          >
            {treeNode}
          </Panel>
        </ResizablePanel>
        <ResizableHandle withHandle className="mx-1" />
        <ResizablePanel defaultSize={sideShown ? "52%" : "80%"} minSize="35%">
          <div className="h-full overflow-auto pr-0.5">{analysis}</div>
        </ResizablePanel>
        {sideShown && (
          <>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize="28%" minSize="20%">
              {infoNode}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
