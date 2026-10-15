import { useQuery } from "@tanstack/react-query";
import { BookOpen, RotateCcw, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { DemoBadge, EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { getCellArcepZones, type DictFilters } from "@/lib/api/client";
import type { GroupBy } from "@/lib/api/dictionary-schemas";
import type { Operator, Service, Tech } from "@/lib/api/schemas";
import { PROJECTS_CENTER } from "./center";
import { ComparisonMatrix } from "./ComparisonMatrix";
import { DistributionPanel } from "./DistributionPanel";
import { MessageParameterCards } from "./MessageParameterCards";
import { ParameterInspector } from "./ParameterInspector";
import { ParameterMapPanel } from "./ParameterMapPanel";
import { ProtocolTree } from "./ProtocolTree";
import { dictQ, errMsg, type Selection } from "./shared";

function useWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}
    >
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

const EMPTY_SEL: Selection = { msgId: null, msgName: null, techno: null, paramId: null };

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
  const [sel, setSel] = useState<Selection>(EMPTY_SEL);
  const [groupBy, setGroupBy] = useState<GroupBy>("operator");
  const [tab, setTab] = useState<"dist" | "cmp" | "map">("dist");
  const [mobileTab, setMobileTab] = useState<"tree" | "center" | "analytics">("tree");
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    setSel(EMPTY_SEL);
  }, [projectId]);
  const proj = useQuery(dictQ.project(projectId));
  // Zone ARCEP (bc4-back 0.7.1) : liste orthogonale à la géo, hors
  // `/geo/tree`. Options issues de `/reference/cell/summary.arcep_breakdown`
  // via `getCellArcepZones()` — jamais hardcodées côté UI.
  const arcepZonesQ = useQuery({
    queryKey: ["reference", "cell", "arcep-zones"],
    queryFn: ({ signal }) => getCellArcepZones(signal),
    staleTime: 5 * 60_000,
  });
  const detail = useQuery({
    ...dictQ.detail(projectId, sel.paramId ?? "", groupBy, filters),
    enabled: !!sel.paramId,
  });
  const map = useQuery({
    ...dictQ.map(projectId, sel.paramId ?? "", filters),
    enabled: !!sel.paramId && tab === "map",
  });

  const dims = proj.data?.dimensions;
  const deps =
    dims?.geo_tree.flatMap((p) => p.children.flatMap((d) => d.children.map((x) => x.id))) ?? [];
  const activeCount = (["op", "tech", "svc", "band", "dep", "arcep"] as const).reduce(
    (a, k) => a + (filters[k]?.length ?? 0),
    0,
  );

  const tree = (
    <ProtocolTree
      projectId={projectId}
      filters={filters}
      sel={sel}
      onMessage={(msgId, msgName, techno) => {
        setSel({ msgId, msgName, techno, paramId: null });
        setMobileTab("center");
      }}
      onParam={(paramId, msgId, msgName, techno) => {
        setSel({ msgId, msgName, techno, paramId });
        setMobileTab("center");
      }}
    />
  );
  const center = !sel.msgId ? (
    <EmptyState title="Sélectionnez un message">
      Choisissez un message dans l'explorateur pour afficher ses paramètres, puis un paramètre pour
      l'inspecter.
    </EmptyState>
  ) : (
    <div className="flex flex-col">
      {sel.paramId && (
        <div className="border-b">
          {detail.isPending && (
            <div className="p-3">
              <LoadingSkeleton className="h-48" />
            </div>
          )}
          {detail.isError && (
            <div className="h-48">
              <ErrorState message={errMsg(detail.error)} onRetry={() => detail.refetch()} />
            </div>
          )}
          {detail.data && <ParameterInspector fiche={detail.data.fiche} />}
        </div>
      )}
      <MessageParameterCards
        projectId={projectId}
        filters={filters}
        msgId={sel.msgId}
        msgName={sel.msgName!}
        selected={sel.paramId}
        onSelect={(paramId) => {
          setSel((s) => ({ ...s, paramId }));
        }}
      />
    </div>
  );
  const analytics = (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Analyses" className="flex shrink-0 gap-1 border-b px-2">
        {(
          [
            ["dist", "Distribution"],
            ["cmp", "Comparaison"],
            ["map", "Carte"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`border-b-2 px-2.5 py-2 text-[11px] font-semibold ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {!sel.paramId ? (
          <EmptyState title="Aucun paramètre sélectionné">
            Sélectionnez un paramètre (ex. rsrpResult) pour voir sa distribution, la matrice croisée
            et la carte.
          </EmptyState>
        ) : tab === "map" ? (
          map.isPending ? (
            <div className="p-2">
              <LoadingSkeleton className="h-[340px]" />
            </div>
          ) : map.isError ? (
            <ErrorState message={errMsg(map.error)} onRetry={() => map.refetch()} />
          ) : (
            <ParameterMapPanel data={map.data} center={PROJECTS_CENTER(projectId)} />
          )
        ) : detail.isPending ? (
          <div className="p-2">
            <LoadingSkeleton className="h-64" />
          </div>
        ) : detail.isError ? (
          <ErrorState message={errMsg(detail.error)} onRetry={() => detail.refetch()} />
        ) : tab === "dist" ? (
          <DistributionPanel detail={detail.data} />
        ) : (
          <ComparisonMatrix
            detail={detail.data}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            fetching={detail.isFetching}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col gap-2 p-2 lg:h-[calc(100vh-56px)]">
      {/* filtres partagés (options issues de GET /projects/{id}) */}
      <div className="panel flex flex-wrap items-center gap-1.5 px-2 py-1.5">
        <BookOpen className="h-4 w-4 text-primary" aria-hidden />
        <h1 className="mr-2 text-sm font-bold">
          Dictionnaire RRC <span className="font-normal text-muted-foreground">LTE + NR</span>
        </h1>
        {proj.isError && (
          <span className="text-[11px] text-destructive">
            Dimensions indisponibles : {errMsg(proj.error)}
          </span>
        )}
        {dims && (
          <>
            <MultiSelect
              label="Opérateur"
              options={dims.operators as Operator[]}
              value={filters.op ?? []}
              onChange={(v) => setFilters({ op: v })}
            />
            <MultiSelect
              label="Techno"
              options={dims.technos as Tech[]}
              value={filters.tech ?? []}
              onChange={(v) => setFilters({ tech: v })}
            />
            <MultiSelect
              label="Service"
              options={dims.services as Service[]}
              value={filters.svc ?? []}
              onChange={(v) => setFilters({ svc: v })}
            />
            <MultiSelect
              label="Bande"
              options={dims.bands}
              value={filters.band ?? []}
              onChange={(v) => setFilters({ band: v })}
            />
            <MultiSelect
              label="Zone ARCEP"
              options={arcepZonesQ.data ?? []}
              value={filters.arcep ?? []}
              onChange={(v) => setFilters({ arcep: v })}
            />
            <MultiSelect
              label="Département"
              options={deps}
              value={filters.dep ?? []}
              onChange={(v) => setFilters({ dep: v })}
            />
            <span className="text-[10px] text-muted-foreground" title="Période unique du projet">
              Période : <span className="font-mono">{dims.periods[0]}</span>
            </span>
          </>
        )}
        {activeCount > 0 && (
          <button
            onClick={() =>
              setFilters({
                op: undefined,
                tech: undefined,
                svc: undefined,
                band: undefined,
                dep: undefined,
                arcep: undefined,
              })
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-muted"
          >
            <X className="h-3 w-3" /> Effacer ({activeCount})
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {width >= 1024 && (
            <button
              onClick={() => setLayoutKey((k) => k + 1)}
              className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted"
            >
              <RotateCcw className="h-3 w-3" /> Réinitialiser la disposition
            </button>
          )}
          <DemoBadge />
        </div>
      </div>
      <p className="px-1 text-[11px] text-muted-foreground" aria-live="polite">
        Sélection : {sel.techno && <span className="font-semibold">{sel.techno} › </span>}
        {sel.msgName ? <span className="font-mono">{sel.msgName}</span> : "aucun message"}
        {sel.paramId && detail.data && (
          <>
            {" "}
            ›{" "}
            <span className="font-mono font-semibold text-foreground">
              {detail.data.fiche.leaf}
            </span>
          </>
        )}
      </p>

      {width >= 1024 ? (
        <ResizablePanelGroup
          key={layoutKey}
          orientation="horizontal"
          className="min-h-0 flex-1 gap-0"
        >
          <ResizablePanel defaultSize="23%" minSize="15%">
            <Panel title="Explorateur de protocole" className="h-full">
              {tree}
            </Panel>
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-1" />
          <ResizablePanel defaultSize="42%" minSize="25%">
            <Panel title="Paramètres du message" className="h-full">
              {center}
            </Panel>
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-1" />
          <ResizablePanel defaultSize="35%" minSize="22%">
            <Panel title="Analyse" className="h-full">
              {analytics}
            </Panel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : width >= 640 ? (
        <div className="grid gap-2">
          <div className="grid gap-2 md:grid-cols-[minmax(220px,35%)_1fr]">
            <Panel title="Explorateur de protocole" className="h-[520px]">
              {tree}
            </Panel>
            <Panel title="Paramètres du message" className="h-[520px]">
              {center}
            </Panel>
          </div>
          <Panel title="Analyse" className="min-h-[460px]">
            {analytics}
          </Panel>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            role="tablist"
            aria-label="Vues"
            className="grid grid-cols-3 rounded-md border bg-card p-0.5"
          >
            {(
              [
                ["tree", "Explorateur"],
                ["center", "Paramètres"],
                ["analytics", "Analyse"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={mobileTab === k}
                onClick={() => setMobileTab(k)}
                className={`rounded py-1.5 text-[11px] font-semibold ${mobileTab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <Panel
            title={
              mobileTab === "tree"
                ? "Explorateur de protocole"
                : mobileTab === "center"
                  ? "Paramètres du message"
                  : "Analyse"
            }
            className="h-[70vh]"
          >
            {mobileTab === "tree" ? tree : mobileTab === "center" ? center : analytics}
          </Panel>
        </div>
      )}
    </div>
  );
}
