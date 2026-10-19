import { getProject, getDictTemplates } from "@/lib/api/client";
import { templateLeaves } from "./template-model";
import { TemplateTable } from "./TemplateTable";
import { retryRrcRequest, rrcRetryDelay } from "./request-recovery";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Folder, Info, PanelLeftClose, PanelLeftOpen, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FilterSelect as MultiSelect } from "./FilterSelect";
import { GeographicFilter, ActiveGeographicFilters } from "./GeographicFilter";
import { GEO_KEYS, GEO_LABELS, geoDraft, type GeoDraft } from "./geographic-state";
import { usePanelRef } from "react-resizable-panels";
import { useFilters } from "@/lib/filters";
import {
  identifyTrees,
  selectedParameter,
  selectionId,
  withDisplayedCounts,
} from "./parameter-identity";
import {
  appliedKey,
  defaultFilters,
  draftKey,
  filterSnapshot,
  geographicQuery,
  type RrcFilterState,
} from "./filter-state";
import "./premium.css";
import { EmptyState, LoadingSkeleton } from "@/components/bc4/States";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { DictFilters } from "@/lib/api/client";
import type { Operator } from "@/lib/api/schemas";
import { dictQ } from "@/features/dictionary/shared";
import {
  getDictV2Distribution as getDictDistribution,
  getDictV2FilterOptions,
  getDictV2Tree as getDictTree,
} from "@/lib/api/client";
import { TreePanel, type TreePanelView } from "./TreePanel";
import { ValueExplorer } from "./ValueExplorer";
import { RrcMapPanel } from "./RrcMapPanel";
import { SelectedParameterInfo } from "./SelectedParameterInfo";

import type { DictLeaf, GroupByMode, DictGeographicDimension } from "@/lib/api/dict-v2";

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
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = options.findIndex((option) => option.v === value);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
        onChange(options[next]!.v);
        (event.currentTarget.children[next] as HTMLButtonElement).focus();
      }}
      className="inline-flex h-7 overflow-hidden rounded-md border"
    >
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          tabIndex={value === o.v ? 0 : -1}
          onClick={() => onChange(o.v)}
          className={`px-2.5 text-xs font-medium ${value === o.v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toolbar({
  applied,
  draft,
  setDraft,
  operators,
  bands,
  period,
  infoOpen,
  setInfoOpen,
  mapOpen,
  setMapOpen,
  dirty,
  onApply,
  onReset,
  sidebarControl,
  geography,
  setGeography,
  geoDimensions,
  geoLoading,
  geoError,
}: {
  applied: RrcFilterState;
  geography: GeoDraft;
  setGeography: (draft: GeoDraft) => void;
  geoDimensions: DictGeographicDimension[];
  geoLoading: boolean;
  geoError: boolean;
  sidebarControl: ReactNode;
  draft: Draft;
  setDraft: (d: Draft) => void;
  operators: string[];
  bands: string[];
  period: string | null;
  mapOpen: boolean;
  setMapOpen: (value: boolean) => void;
  infoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
  dirty: boolean;
  onApply: () => void;
  onReset: () => void;
}) {
  const appliedGeo = geographicQuery(applied);
  const hasFilters =
    applied.techno !== "LTE+NR" || applied.band.length > 0 || Object.keys(appliedGeo).length > 0;
  return (
    <>
      <section className="rrc-toolbar rrc-kpi-filterbar" aria-label="Filtres du dictionnaire">
        <div className="rrc-filter-controls" id="rrc-filter-section">
          <Seg
            label="Technologie"
            value={draft.techno}
            onChange={(techno) => setDraft({ ...draft, techno, band: [] })}
            options={[
              { v: "LTE", l: "LTE" },
              { v: "NR", l: "NR" },
              { v: "LTE+NR", l: "LTE + NR" },
            ]}
          />
          <MultiSelect
            showLabel
            operatorBadges
            unavailableReason="Filtrage opérateur non exposé par l’API de distribution."
            label="Opérateur"
            options={operators}
            value={[]}
            onChange={(op) => setDraft({ ...draft, op })}
          />
          <MultiSelect
            showLabel
            label="Bande"
            unavailableReason="Filtrage bande non exposé par l’API de distribution."
            options={bands}
            value={[]}
            onChange={(band) => setDraft({ ...draft, band })}
          />
          <GeographicFilter
            showLabel
            showActiveFilters={false}
            dimensions={geoDimensions}
            draft={geography}
            onChange={setGeography}
            loading={geoLoading}
            error={geoError}
          />
          <ActiveGeographicFilters
            dimensions={geoDimensions}
            draft={geography}
            onChange={setGeography}
            loading={geoLoading}
            error={geoError}
          />
          <span
            className="rrc-filter-period opacity-60"
            aria-disabled="true"
            tabIndex={0}
            title={period
              ? "Plage renvoyée par /projects/{id}. Le filtrage temporel n’est pas pris en charge par l’API du dictionnaire."
              : "plage non exposée par l'API"}
          >
            Période : {period ?? "—"}
          </span>
        </div>
        <div className="rrc-filter-actions">
          {sidebarControl}
          <button
            className="rrc-control rrc-panel-toggle"
            aria-label="Carte"
            aria-pressed={mapOpen}
            onClick={() => setMapOpen(!mapOpen)}
          >
            Carte
          </button>
          <button
            className="rrc-control rrc-panel-toggle"
            aria-label="Infos"
            aria-pressed={infoOpen}
            onClick={() => setInfoOpen(!infoOpen)}
          >
            <Info size={14} aria-hidden="true" />
            Infos
          </button>

          {dirty && (
            <span role="status" className="rrc-draft-notice">
              Modifications non appliquées
            </span>
          )}
          <button onClick={onReset} className="rrc-control">
            <RotateCcw size={13} aria-hidden="true" />
            Réinitialiser
          </button>
          <button
            onClick={onApply}
            disabled={!dirty}
            className="rrc-control rrc-apply"
            aria-label="Appliquer les filtres"
          >
            <Check size={14} aria-hidden="true" />
            Appliquer les filtres
          </button>
        </div>
        {hasFilters && (
          <div className="rrc-applied-chips" aria-label="Filtres appliqués">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Appliqués
            </span>
            {applied.techno !== "LTE+NR" && (
              <button
                className="rrc-chip"
                aria-label="Effacer technologie"
                onClick={() => setDraft({ ...draft, techno: "LTE+NR" })}
              >
                {applied.techno} ×
              </button>
            )}
            {applied.band.map((value) => (
              <button
                key={value}
                className="rrc-chip"
                aria-label={`Effacer ${value}`}
                onClick={() => setDraft({ ...draft, band: draft.band.filter((v) => v !== value) })}
              >
                Bande : {value} ×
              </button>
            ))}
            {GEO_KEYS.flatMap((key) =>
              (appliedGeo[key] ?? []).map((value) => (
                <button
                  key={`${key}:${value}`}
                  className="rrc-chip"
                  aria-label={`Effacer ${GEO_LABELS[key]} ${value}`}
                  onClick={() =>
                    setGeography({
                      ...geography,
                      [key]: {
                        ...geography[key],
                        values: geography[key].values.filter((v) => v !== value),
                      },
                    })
                  }
                >
                  {GEO_LABELS[key]} : {value} ×
                </button>
              )),
            )}
          </div>
        )}
      </section>
    </>
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
  const narrow = width < 768;
  const sidebar = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);
  const { filters: urlFilters, set: setUrlFilters } = useFilters();
  const urlTechno: Techno =
    urlFilters.tech?.length === 1 && (urlFilters.tech[0] === "LTE" || urlFilters.tech[0] === "NR")
      ? urlFilters.tech[0]
      : "LTE+NR";
  const urlSnapshot = filterSnapshot({
    techno: urlTechno,
    op: [],
    band: [],
    geography: geoDraft({
      dor: urlFilters.dor ?? [],
      plaque: urlFilters.plaque ?? [],
      arcep_zone: urlFilters.arcep ?? [],
    }),
  });
  const urlKey = appliedKey(urlSnapshot);
  const [draftFilters, setDraftFilters] = useState<RrcFilterState>(() => urlSnapshot);
  const [appliedFilters, setAppliedFilters] = useState<RrcFilterState>(() => urlSnapshot);
  const writtenUrl = useRef<string | null>(null);
  useEffect(() => {
    if (writtenUrl.current === urlKey) {
      writtenUrl.current = null;
      return;
    }
    setDraftFilters(urlSnapshot);
    setAppliedFilters(urlSnapshot);
    // Only URL context changes initialize drafts, never query rerenders or selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, urlKey]);
  const draft = draftFilters;
  const setDraft = (next: Draft) => setDraftFilters((previous) => ({ ...previous, ...next }));
  const geography = draftFilters.geography;
  const setGeography = (next: GeoDraft) =>
    setDraftFilters((previous) => ({ ...previous, geography: next }));
  const techno = appliedFilters.techno;
  const geoQ = useQuery({
    queryKey: ["dict-v2", "filters", projectId],
    queryFn: () => getDictV2FilterOptions(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
  });
  const geoDimensions = geoQ.data?.geographic ?? [];
  const effectiveGeo = geographicQuery(appliedFilters);
  const [groupBy, setGroupBy] = useState<GroupByMode>("operator");

  const [infoOpen, setInfoOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [selected, setSelected] = useState<DictLeaf[]>([]);
  const beforeTemplate = useRef<DictLeaf[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [templateVisible, setTemplateVisible] = useState(true);
  const [treeView, setTreeView] = useState<TreePanelView>("catalog");
  const templatesQ = useQuery({
    queryKey: ["dict-v2", "templates", projectId],
    queryFn: () => getDictTemplates(projectId),
    enabled: !!projectId && treeView === "templates",
    staleTime: 60000,
  });
  const categories = useMemo(
    () => [...(templatesQ.data?.categories ?? [])].sort((a, b) => a.position - b.position),
    [templatesQ.data],
  );
  const activeCategory = categories.find((category) => category.id === categoryId) ?? null;
  useEffect(() => {
    setCategoryId(null);
  }, [projectId]);
  // Signal vers TreePanel pour qu'il replie à l'état initial +
  // vide sa recherche. Incrémenté par le bouton Réinitialiser.
  const [resetTick, setResetTick] = useState(0);
  const resetTree = () => {
    setTreeView("catalog");
    beforeTemplate.current = [];
    setCategoryId(null);
    setSelected([]);
    setResetTick((t) => t + 1);
  };

  const projectPeriod = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  });
  const proj = useQuery(dictQ.project(projectId));
  const dims = proj.data?.dimensions;
  const dirty = draftKey(draftFilters) !== draftKey(appliedFilters);
  const [filterError, setFilterError] = useState<string | null>(null);
  const apply = () => {
    const invalid = GEO_KEYS.find(
      (key) =>
        geography[key].enabled &&
        geography[key].values.length &&
        !geoDimensions.some(
          (d) =>
            d.key === key &&
            d.available &&
            geography[key].values.every((v) => d.options.includes(v)),
        ),
    );
    if (invalid) {
      setFilterError(
        `${GEO_LABELS[invalid]} : sélection indisponible dans les métadonnées du projet.`,
      );
      return;
    }
    const snapshot = filterSnapshot({ ...draftFilters, op: [], band: [] });
    setFilterError(null);
    writtenUrl.current = appliedKey(snapshot);
    setAppliedFilters(snapshot);
    setUrlFilters({
      op: snapshot.op as Operator[],
      band: snapshot.band,
      tech: snapshot.techno === "LTE+NR" ? undefined : [snapshot.techno],
      dor: snapshot.geography.dor.enabled ? snapshot.geography.dor.values : undefined,
      plaque: snapshot.geography.plaque.enabled ? snapshot.geography.plaque.values : undefined,
      arcep: snapshot.geography.arcep_zone.enabled
        ? snapshot.geography.arcep_zone.values
        : undefined,
    });
  };
  const reset = () => {
    setDraftFilters(defaultFilters());
    setFilterError(null);
  };

  // Deux arbres : catalog (défaut, onglet Paramètres) + raw (onglet Raw).
  const catalogQ = useQuery({
    queryKey: ["dict-v2", "tree", projectId, "catalog"],
    // Metadata is project-keyed: let an in-flight load populate the cache across navigation.
    queryFn: () => getDictTree(projectId, "catalog"),
    enabled: !!projectId,
    staleTime: Infinity,
  });
  const rawQ = useQuery({
    queryKey: ["dict-v2", "tree", projectId, "raw"],
    queryFn: () => getDictTree(projectId, "raw"),
    enabled: !!projectId && treeView === "raw",
    staleTime: Infinity,
  });

  const identified = useMemo(
    () => identifyTrees(catalogQ.data ?? null, rawQ.data ?? null),
    [catalogQ.data, rawQ.data],
  );
  const selectedKeys = useMemo(() => selected.map((leaf) => leaf.param_key), [selected]);
  const effectiveKeys = useMemo(
    () =>
      [
        ...new Set(
          selected
            .filter(
              (leaf) =>
                !leaf["mapping_error"] && (techno === "LTE+NR" || leaf["technology"] === techno),
            )
            .map((leaf) => leaf.param_key),
        ),
      ].sort(),
    [selected, techno],
  );
  const contextKey = appliedKey(appliedFilters);
  const requestGroup = groupBy;
  const distributionQ = useQuery({
    queryKey: ["dict-v2", "distribution", projectId, contextKey, effectiveKeys, groupBy],
    queryFn: async () => ({
      response: await getDictDistribution(
        projectId,
        effectiveKeys,
        requestGroup,
        undefined,
        effectiveGeo,
        appliedFilters.techno,
      ),
      filters: appliedFilters,
      groupBy,
      contextKey,
    }),
    enabled: !!projectId && effectiveKeys.length > 0 && !geoQ.isPending,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: retryRrcRequest,
    retryDelay: rrcRetryDelay,
  });
  const lastValid = useRef<typeof distributionQ.data>(undefined);
  useEffect(() => {
    if (distributionQ.data && !distributionQ.isPlaceholderData)
      lastValid.current = distributionQ.data;
  }, [distributionQ.data, distributionQ.isPlaceholderData]);
  const displayed = effectiveKeys.length ? (distributionQ.data ?? lastValid.current) : undefined;
  const displayedDistribution = displayed?.response ?? null;
  const previousContext =
    !!displayed &&
    (displayed.contextKey !== contextKey ||
      distributionQ.isPlaceholderData ||
      !!distributionQ.error);
  const selectedSet = useMemo(() => new Set(selected.map(selectionId)), [selected]);
  const onToggle = (leaf: DictLeaf) => {
    const resolved = selectedParameter(leaf);
    setSelected((previous) =>
      previous.some((p) => selectionId(p) === selectionId(resolved))
        ? previous.filter((p) => selectionId(p) !== selectionId(resolved))
        : [...previous, resolved],
    );
  };

  const collapseTreeControl = (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Plier l’arbre des paramètres"
      title="Plier l’arbre des paramètres"
      onClick={() => {
        if (narrow) setCollapsed(true);
        else sidebar.current?.collapse();
      }}
    >
      <PanelLeftClose size={16} aria-hidden="true" />
    </button>
  );

  const toolbar = (
    <Toolbar
      applied={appliedFilters}
      geography={geography}
      setGeography={setGeography}
      geoDimensions={geoDimensions}
      geoLoading={geoQ.isPending}
      geoError={geoQ.isError}
      sidebarControl={
        collapsed && (
          <button
            className="rrc-control"
            aria-label="Afficher les paramètres"
            title="Afficher les paramètres"
            onClick={() => {
              if (narrow) setCollapsed(false);
              else sidebar.current?.expand();
            }}
          >
            <PanelLeftOpen size={16} aria-hidden="true" />
          </button>
        )
      }
      draft={draft}
      setDraft={setDraft}
      operators={dims?.operators ?? []}
      bands={(dims?.bands ?? []).filter(
        (band) =>
          draft.techno === "LTE+NR" ||
          (draft.techno === "NR" ? /^n/i.test(band) : /^b/i.test(band)),
      )}
      period={projectPeriod.data?.periodStart && projectPeriod.data?.periodEnd
        ? `${projectPeriod.data.periodStart} → ${projectPeriod.data.periodEnd}`
        : null}
      mapOpen={mapOpen}
      setMapOpen={setMapOpen}
      infoOpen={infoOpen}
      setInfoOpen={setInfoOpen}
      dirty={dirty}
      onApply={apply}
      onReset={reset}
    />
  );

  const populationTrees = useMemo(() => {
    const counts = new Map(
      selected.map((leaf) => {
        const block = displayedDistribution?.blocks.find((b) => b.param_key === leaf.param_key);
        return [
          selectionId(leaf),
          previousContext || !block
            ? null
            : block.n_total,
        ] as const;
      }),
    );
    return {
      catalog: withDisplayedCounts(identified.catalog, counts),
      raw: withDisplayedCounts(identified.raw, counts),
    };
  }, [identified, selected, displayedDistribution, previousContext]);
  const treeNode = (
    <TreePanel
      onViewChange={setTreeView}
      categories={categories}
      activeCategory={activeCategory}
      templatesLoading={templatesQ.isPending}
      templatesError={templatesQ.isError}
      onCategory={(category) => {
        if (categoryId === category.id) {
          setSelected(beforeTemplate.current);
          setCategoryId(null);
          return;
        }
        if (!categoryId) beforeTemplate.current = selected;
        setCategoryId(category.id);
        setTemplateVisible(true);
        setSelected(templateLeaves(identified.catalog, category).map(selectedParameter));
      }}
      techno={techno}
      catalog={populationTrees.catalog}
      raw={populationTrees.raw}
      selected={selectedSet}
      onToggle={onToggle}
      onInfo={() => setInfoOpen(true)}
      onReset={resetTree}
      resetTick={resetTick}
    />
  );

  const analysis =
    selectedKeys.length === 0 ? (
      <div className="panel p-4">
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
      <>
        {!!(filters.op?.length || filters.band?.length) && (
          <p role="status" className="rrc-context-notice">
            Les filtres opérateur/bande de l’URL ne sont pas appliqués : l’API de distribution ne les prend pas en charge.
          </p>
        )}
        {previousContext && (
          <p role="status" className="rrc-context-notice">
            Résultats du contexte précédent conservés —{" "}
            {distributionQ.error ? "chargement échoué" : "actualisation en cours"}.{" "}
            {displayed?.filters.techno} ·{" "}
            {displayed?.filters.op.join(", ") || "Tous les opérateurs"} ·{" "}
            {displayed?.filters.band.join(", ") || "Toutes les bandes"}
          </p>
        )}
        {!previousContext &&
          distributionQ.isSuccess &&
          effectiveKeys.some(
            (key) => !displayed?.response.blocks.some((block) => block.param_key === key),
          ) && (
            <p role="alert" className="rrc-context-notice">
              Incohérence : un paramètre demandé est absent de la réponse analytique.
            </p>
          )}
        {selected.some((leaf) => leaf["mapping_error"]) && (
          <div role="alert" className="rrc-context-notice">
            {selected
              .filter((leaf) => leaf["mapping_error"])
              .map((leaf) => (
                <p key={selectionId(leaf)}>
                  {leaf.display_name} : {String(leaf["mapping_error"])}
                </p>
              ))}
          </div>
        )}
        {distributionQ.isFetching && distributionQ.failureCount > 0 && (
          <p role="status" className="rrc-context-notice">
            Connexion au serveur interrompue — nouvelle tentative en cours…
          </p>
        )}
        <ValueExplorer
          catalog={catalogQ.data ?? null}
          distribution={displayedDistribution}
          filtered={!!(displayed?.filters.op.length || displayed?.filters.band.length)}
          groupBy={displayed?.groupBy ?? groupBy}
          onGroupByChange={setGroupBy}
          isLoading={distributionQ.isLoading}
          error={distributionQ.error}
          onRetry={() => distributionQ.refetch()}
          selectedKeys={selectedKeys}
        />
      </>
    );

  const information = (
    <>
      {infoOpen && (
        <div className="rrc-left-info" data-testid="rrc-left-info">
          <SelectedParameterInfo
            projectId={projectId}
            selected={selected}
            catalog={catalogQ.data ?? null}
            distribution={displayedDistribution}
            refreshing={previousContext || distributionQ.isFetching}
            locallyFiltered={Boolean(appliedFilters.op.length || appliedFilters.band.length)}
          />
        </div>
      )}
    </>
  );

  const workspace = (
    <>
      {mapOpen && (
        <RrcMapPanel
          projectId={projectId}
          keys={effectiveKeys}
          geographic={effectiveGeo}
          technology={appliedFilters.techno}
          operators={appliedFilters.op}
          bands={appliedFilters.band}
          selectedCount={selected.length}
        />
      )}
      {activeCategory && treeView === "templates" && (
        <div className="mb-4 space-y-2">
          <button className="rrc-control" onClick={() => setTemplateVisible((v) => !v)}>
            {templateVisible ? "Afficher les histogrammes" : "Afficher le tableau du template"}
          </button>
          {templateVisible &&
            (appliedFilters.op.length ||
            appliedFilters.band.length ||
            Object.keys(effectiveGeo).length ? (
              <p role="status" className="rounded border bg-muted p-3 text-sm">
                Le résumé de template fourni par le serveur couvre le projet entier. Retirez les
                restrictions opérateur, bande et géographie puis appliquez pour le consulter. Les
                histogrammes ci-dessous utilisent vos filtres appliqués.
              </p>
            ) : (
              <TemplateTable
                projectId={projectId}
                category={activeCategory}
                technology={techno}
                onGraph={(key, technology) => {
                  const leaf = templateLeaves(identified.catalog, activeCategory).find(
                    (l) => l.param_key === key && l["technology"] === technology,
                  );
                  if (leaf)
                    setSelected((previous) =>
                      previous.some((l) => selectionId(l) === selectionId(leaf))
                        ? previous
                        : [...previous, selectedParameter(leaf)],
                    );
                  setTemplateVisible(false);
                }}
              />
            ))}
        </div>
      )}
      {(!activeCategory ||
        treeView !== "templates" ||
        !templateVisible ||
        appliedFilters.op.length > 0 ||
        appliedFilters.band.length > 0 ||
        Object.keys(effectiveGeo).length > 0) &&
        analysis}
    </>
  );

  return (
    <div className="rrc-premium rrc-workstation">
      {toolbar}
      {filterError && (
        <p role="alert" className="rrc-context-notice">
          {filterError}
        </p>
      )}
      {narrow ? (
        <div className="rrc-mobile-layout">
          <div className="rrc-mobile-tree" hidden={collapsed}>
            <Panel
              title="Paramètres RRC"
              icon={<Folder className="h-4 w-4 text-primary" />}
              actions={collapseTreeControl}
              className="h-full"
            >
              {treeNode}
            </Panel>
          </div>
          {information}
          <div className="rrc-mobile-analysis rrc-central-workspace">{workspace}</div>
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel
            panelRef={sidebar}
            defaultSize="300px"
            minSize="250px"
            maxSize="420px"
            collapsible
            onResize={(size) => setCollapsed(size.inPixels === 0)}
          >
            <Panel
              title="Paramètres RRC"
              icon={<Folder className="h-4 w-4 text-primary" />}
              actions={collapseTreeControl}
              className="h-full"
            >
              {treeNode}
            </Panel>
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-1" />
          {infoOpen && (
            <>
              <ResizablePanel
                id="rrc-info-panel"
                defaultSize="320px"
                minSize="280px"
                maxSize="420px"
              >
                {information}
              </ResizablePanel>
              <ResizableHandle withHandle className="mx-1" aria-label="Redimensionner les infos" />
            </>
          )}
          <ResizablePanel minSize="300px">
            <div
              className="rrc-analysis-scroll rrc-central-workspace"
              data-testid="dict-analysis-scroll"
            >
              {workspace}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
