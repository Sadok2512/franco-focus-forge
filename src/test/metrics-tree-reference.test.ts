import { describe, expect, it } from "vitest";
import { applyReferenceHierarchy } from "@/features/kpi/metrics-tree-reference";
import type { MetricCatalogNode, MetricCatalogResponse } from "@/lib/api/metrics-schemas";

/**
 * B5 — tests ciblés pour `applyReferenceHierarchy`.
 *
 * Objectif : prouver que la transformation respecte les règles de la mission :
 *   - 0 métrique ajoutée
 *   - 0 métrique supprimée (tous les leaves d'entrée se retrouvent en sortie)
 *   - 0 clé API modifiée (metric_id, selection, selectable, n, proof, reason)
 *   - 4 racines techno attendues (LTE, NR, EN-DC, QUARANTAINE) lorsqu'un
 *     échantillon de leaves RF reclassifiables est passé
 *   - Non-RF (event === null) préservés sous leur hiérarchie d'origine
 */

function makeLeaf(partial: Partial<MetricCatalogNode> & { node_id: string }): MetricCatalogNode {
  return {
    node_id: partial.node_id,
    parent_id: partial.parent_id ?? null,
    order: partial.order ?? 0,
    label: partial.label ?? "test",
    note: partial.note ?? null,
    source: partial.source ?? null,
    node_type: partial.node_type ?? "leaf",
    analytics_tab: partial.analytics_tab ?? "metrics",
    metric_id: partial.metric_id ?? null,
    selection: partial.selection ?? null,
    event: partial.event ?? null,
    field_idx: partial.field_idx ?? null,
    source_column: partial.source_column ?? null,
    unit: partial.unit ?? "",
    cell: partial.cell ?? null,
    n: partial.n ?? 0,
    proof: partial.proof ?? "",
    selectable: partial.selectable ?? false,
    reason: partial.reason ?? null,
  };
}

function makeResponse(nodes: MetricCatalogNode[]): MetricCatalogResponse {
  return {
    catalogue_version: "2.60.0",
    title: "Metrics",
    header: "test",
    decoder_version: "1.9.0",
    reason: "",
    metrics: [],
    nodes,
  } as MetricCatalogResponse;
}

describe("applyReferenceHierarchy — bijection et préservation", () => {
  it("ne modifie pas une réponse sans leaves RF (preserved CAPTURE path)", () => {
    const inputNodes: MetricCatalogNode[] = [
      makeLeaf({ node_id: "tech_CAPTURE", node_type: "tech", label: "CAPTURE" }),
      makeLeaf({
        node_id: "lf_capture_file_log_file_name",
        parent_id: "tech_CAPTURE",
        label: "Log file name",
        metric_id: "cap_file_log_file_name",
        selectable: true,
      }),
    ];
    const out = applyReferenceHierarchy(makeResponse(inputNodes));
    expect(out.nodes.length).toBe(2);
    const leaf = out.nodes.find((n) => n.node_id === "lf_capture_file_log_file_name");
    expect(leaf?.parent_id).toBe("tech_CAPTURE");
    expect(leaf?.metric_id).toBe("cap_file_log_file_name");
    expect(leaf?.selectable).toBe(true);
  });

  it("reparent un leaf RF connu dans la chaîne synthétique", () => {
    // lf_cellmeas_params_cell_c0 : CELLMEAS raw=0 LTE Serving radio
    const input: MetricCatalogNode[] = [
      makeLeaf({ node_id: "tech_LTE", node_type: "tech", label: "LTE" }),
      makeLeaf({ node_id: "cat_LTE_serving_radio", parent_id: "tech_LTE", node_type: "category", label: "Serving radio" }),
      makeLeaf({ node_id: "ev_cellmeas", parent_id: "cat_LTE_serving_radio", node_type: "event", label: "CELLMEAS" }),
      makeLeaf({
        node_id: "lf_cellmeas_rsrp_c0",
        parent_id: "ev_cellmeas",
        label: "RSRP (LTE) @ Serving",
        metric_id: "cell_rsrp@lte-type-0",
        selection: "cell_rsrp@lte-type-0",
        event: "CELLMEAS",
        selectable: true,
        n: 42,
        proof: "documented-2.50",
      }),
    ];
    const out = applyReferenceHierarchy(makeResponse(input));
    const leaf = out.nodes.find((n) => n.node_id === "lf_cellmeas_rsrp_c0");
    expect(leaf).toBeDefined();
    expect(leaf!.metric_id).toBe("cell_rsrp@lte-type-0");
    expect(leaf!.selection).toBe("cell_rsrp@lte-type-0");
    expect(leaf!.n).toBe(42);
    expect(leaf!.selectable).toBe(true);
    expect(leaf!.proof).toBe("documented-2.50");
    // parent_id a été remappé vers une racine synthétique
    expect(leaf!.parent_id).toMatch(/^ref:met:LTE\/Serving radio\/Serving\//);
    // chaîne synthétique présente
    const techLTE = out.nodes.find((n) => n.node_id === "ref:tech:LTE");
    expect(techLTE?.label).toBe("LTE");
    const cat = out.nodes.find((n) => n.node_id === "ref:cat:LTE/Serving radio");
    expect(cat?.parent_id).toBe("ref:tech:LTE");
    const grp = out.nodes.find((n) => n.node_id === "ref:grp:LTE/Serving radio/Serving");
    expect(grp?.parent_id).toBe("ref:cat:LTE/Serving radio");
    // Les anciens parent nodes (tech_LTE etc) sont retirés : aucun leaf non-reparentted ne les référence
    expect(out.nodes.some((n) => n.node_id === "tech_LTE")).toBe(false);
  });

  it("expose les 4 racines référence quand une entrée reclassée de chaque tech est fournie", () => {
    const input: MetricCatalogNode[] = [
      // LTE KPI (RSRP is a real KPI in the oracle)
      makeLeaf({
        node_id: "lf_cellmeas_rsrp_c0",
        label: "RSRP (LTE) @ Serving",
        metric_id: "cell_rsrp@lte-type-0",
        event: "CELLMEAS",
        selectable: true,
      }),
      // NR KPI (TO on SCG SCell 0 is a real KPI)
      makeLeaf({
        node_id: "lf_cellmeas_to_c100",
        label: "TO (bloc NR) @ SCG SCell 0",
        metric_id: "cell_to@nr-type-100",
        event: "CELLMEAS",
        selectable: true,
      }),
      // QUARANTAINE KPI (C/I foreign tech)
      makeLeaf({
        node_id: "lf_ci_c_i_c0",
        label: "C/I (bloc GSM) @ PCell",
        metric_id: "ci_c_i@0",
        event: "CI",
        selectable: true,
      }),
    ];
    const out = applyReferenceHierarchy(makeResponse(input));
    const roots = out.nodes.filter((n) => n.node_type === "tech").map((n) => n.label).sort();
    // EN-DC is intentionally absent: the certified oracle has only
    // STRUCT / DIM entries under EN-DC (no KPI), so the k === "KPI"
    // filter leaves this branch empty — a strict mirror of tree.html's
    // "onlyKpi" view.
    expect(roots).toEqual(["LTE", "NR", "QUARANTAINE"]);
  });

  it("ne crée aucun leaf supplémentaire, ne supprime aucun leaf", () => {
    const input: MetricCatalogNode[] = [
      makeLeaf({ node_id: "lf_a", label: "#Params/cell (LTE) @ Serving", metric_id: "cellmeas_params_cell@0", event: "CELLMEAS", selectable: true }),
      makeLeaf({ node_id: "lf_b", label: "Log file name", metric_id: "cap_file_log_file_name", selectable: true }),
    ];
    const out = applyReferenceHierarchy(makeResponse(input));
    const inputLeafIds = input.filter((n) => n.node_type === "leaf").map((n) => n.node_id).sort();
    const outputLeafIds = out.nodes.filter((n) => n.node_type === "leaf").map((n) => n.node_id).sort();
    expect(outputLeafIds).toEqual(inputLeafIds);
  });
});
