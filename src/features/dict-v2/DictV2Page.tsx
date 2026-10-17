// bc4-front — Page Dict RRC v2 : deux arbres + explorateur de valeurs.
// Design hérité des composants existants (/kpi : MultiSelect, Chart,
// panel). Pas d'invention de style — la maquette dict_explorer.html sert
// de référence de disposition/comportement, pas de look.
//
// Contrat back 0.45.1 : /projects/{id}/dict/v2/tree?view=catalog|raw,
// /dict/v2/distribution?keys=…&group_by=operator|band|operator_band,
// /dict/v2/param/{key}. Les filtres opérateur/bande/ARCEP viennent de
// FilterContext (useFilters). Le group_by local pilote la segmented bar.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { LoadingSkeleton } from "@/components/bc4/States";
import { OPERATORS, type Operator } from "@/lib/api/schemas";
import { useFilters } from "@/lib/filters";
import { getCellArcepZones } from "@/lib/api/client";
import {
  getDictDistribution,
  getDictTree,
  type DictLeaf,
  type GroupByMode,
} from "@/lib/api/dict-v2";
import { TreePanel } from "./TreePanel";
import { ValueExplorer } from "./ValueExplorer";
import { InfoDrawer } from "./InfoDrawer";

// Bandes partagées avec /kpi (OP = sous-ensemble ; le dict n'a pas de
// propre liste normée).
const DICT_BANDS = ["B3", "B7", "B20", "B28", "B1", "n78", "n28", "n1"] as const;

export function DictV2Page({ projectId }: { projectId: string }) {
  const { filters, set } = useFilters();
  const [groupBy, setGroupBy] = useState<GroupByMode>("operator");
  const [selected, setSelected] = useState<DictLeaf[]>([]);
  const [infoKey, setInfoKey] = useState<string | null>(null);

  const arcepQ = useQuery({
    queryKey: ["reference", "cell", "arcep-zones"],
    queryFn: ({ signal }) => getCellArcepZones(signal),
    staleTime: 5 * 60_000,
  });

  // Deux appels tree : catalog (défaut, onglet Paramètres) + raw (onglet
  // Raw). Les deux sont servis par le back sans overhead côté UI (<100 ms).
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

  const activeCount = (["op", "band", "arcep"] as const).reduce(
    (a, kf) => a + (filters[kf]?.length ?? 0),
    0,
  );

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const onToggle = (leaf: DictLeaf) => {
    setSelected((prev) => {
      const has = prev.some((p) => p.param_key === leaf.param_key);
      return has ? prev.filter((p) => p.param_key !== leaf.param_key) : [...prev, leaf];
    });
    setInfoKey(leaf.param_key);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Barre de filtres : importe les MultiSelect du front existant,
          mêmes options que /kpi (op, band, arcep) et même ergonomie —
          le design reste strictement celui du front, pas de la
          maquette. */}
      <div
        className="panel flex flex-wrap items-center gap-1.5 px-2 py-1.5"
        data-testid="dict-filters-bar"
      >
        <h2 className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filtres
        </h2>
        <MultiSelect
          label="Opérateur"
          options={OPERATORS}
          value={(filters.op ?? []) as Operator[]}
          onChange={(v) => set({ op: v })}
        />
        <MultiSelect
          label="Bande"
          options={DICT_BANDS}
          value={filters.band ?? []}
          onChange={(v) => set({ band: v })}
        />
        <MultiSelect
          label="Zone ARCEP"
          options={arcepQ.data ?? []}
          value={filters.arcep ?? []}
          onChange={(v) => set({ arcep: v })}
        />
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => set({ op: undefined, band: undefined, arcep: undefined })}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-muted"
          >
            <X className="h-3 w-3" /> Effacer ({activeCount})
          </button>
        )}
      </div>

      {catalogQ.isLoading || !catalogQ.data ? (
        <LoadingSkeleton className="h-96" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
          <TreePanel
            catalog={catalogQ.data ?? null}
            raw={rawQ.data ?? null}
            selected={selectedSet}
            onToggle={onToggle}
            onInfo={(leaf) => setInfoKey(leaf.param_key)}
          />
          <div className="flex min-w-0 flex-col gap-3">
            <ValueExplorer
              distribution={distributionQ.data ?? null}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              isLoading={distributionQ.isLoading}
              error={distributionQ.error}
              selectedKeys={selectedKeys}
            />
            <InfoDrawer projectId={projectId} paramKey={infoKey} />
          </div>
        </div>
      )}
    </div>
  );
}
