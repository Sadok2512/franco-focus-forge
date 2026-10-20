import { memo, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Info, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DictTreeResponse, DistributionBlock, GroupByMode } from "@/lib/api/dict-v2";
import {
  attributedTableColumns,
  buildGroupedTable,
  groupRows,
  hierarchyRows,
  selectRows,
  tableCsv,
  type Column,
  type TableSort,
  type ValueRow,
} from "./grouped-table";
const percent = (value: number) =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const ROW_HEIGHT = 40;
const EMPTY_CLOSED = new Set<string>();
const ValueCells = memo(function ValueCells({
  row,
  columns,
}: {
  row: ValueRow;
  columns: Column[];
}) {
  return (
    <>
      <td
        className="rrc-hierarchy-value"
        aria-label={`${row.family} / ${row.parameter} / ${row.value}`}
        title={row.asn1Path}
      >
        <span>{row.value}</span>
      </td>
      {columns.map((column) => {
        const cell = row.cells[column.id]!;
        return (
          <td
            key={column.id}
            className="rrc-number"
            title={`${cell.denominator === null ? "Pourcentage et dénominateur non exposés par l’API. " : ""}${row.parameter} · ${column.label} : ${cell.count ?? "—"} / ${cell.denominator ?? "—"} · ${cell.percentage === null ? "—" : percent(cell.percentage)}`}
          >
            {cell.count === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <>
                <div>
                  <strong>{cell.count.toLocaleString("fr-FR")}</strong>
                  <span className="rrc-percentage">
                    {" "}
                    · {cell.percentage === null ? "—" : percent(cell.percentage)}
                  </span>
                </div>
                {cell.denominator !== null && cell.denominator > 0 && cell.percentage !== null && (
                  <div className="rrc-cell-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, Math.max(0, cell.percentage ?? 0))}%`,
                        background: column.color,
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </td>
        );
      })}
    </>
  );
});
export function GroupedValueTable({
  blocks,
  groupBy,
  catalog,
}: {
  blocks: DistributionBlock[];
  groupBy: GroupByMode;
  catalog?: DictTreeResponse | null;
}) {
  const model = useMemo(
    () => buildGroupedTable(blocks, groupBy, catalog),
    [blocks, groupBy, catalog],
  );
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [sort, setSort] = useState<TableSort>({ key: "value", desc: false });
  const [copied, setCopied] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [searchClosed, setSearchClosed] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const searching = !!search.trim();
  const activeClosed = searching ? searchClosed : closed;
  const rows = useMemo(() => selectRows(model.rows, search, sort), [model.rows, search, sort]);
  const families = useMemo(() => groupRows(rows), [rows]);
  const nodes = useMemo(() => hierarchyRows(families, activeClosed), [families, activeClosed]);
  const attributed = useMemo(
    () => attributedTableColumns(model.columns, groupBy),
    [model.columns, groupBy],
  );
  const unattributedHidden = attributed.length < model.columns.length;
  const visible = useMemo(
    () => attributed.filter((column) => !hidden.includes(column.id)),
    [attributed, hidden],
  );
  const headers = [{ id: "value", label: "Famille / Paramètre / Valeur" }, ...visible];
  // Window only large result sets. Every hierarchy row has the same measured CSS height.
  const virtual = nodes.length > 300;
  const start = virtual
    ? Math.max(
        0,
        Math.min(
          Math.floor(Math.max(0, scrollTop - ROW_HEIGHT) / ROW_HEIGHT) - 8,
          nodes.length - 28,
        ),
      )
    : 0;
  const end = virtual ? Math.min(nodes.length, start + 28) : nodes.length;
  function changeClosed(next: Set<string>) {
    if (searching) setSearchClosed(next);
    else setClosed(next);
  }
  function toggle(id: string) {
    const next = new Set(activeClosed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    changeClosed(next);
  }
  function expandAll(expand: boolean) {
    changeClosed(
      expand
        ? new Set()
        : new Set(
            hierarchyRows(families, EMPTY_CLOSED)
              .filter((node) => node.kind !== "value")
              .map((node) => node.id),
          ),
    );
  }
  async function copy() {
    const csv = tableCsv(rows, model.columns);
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
    } catch {
      const url = URL.createObjectURL(
        new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "rrc-valeurs.csv";
      link.click();
      URL.revokeObjectURL(url);
    }
  }
  return (
    <section className="rrc-results rrc-grouped rrc-hierarchy" aria-label="Tableau des valeurs">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            Tableau des valeurs{" "}
            <span className="font-normal text-muted-foreground">({rows.length})</span>
          </h3>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            Famille · Paramètre · Valeurs
            {unattributedHidden && (
              <span
                tabIndex={0}
                role="img"
                aria-label="Les enregistrements non attribués sont masqués dans les colonnes opérateurs, mais conservés dans les données sources et l’export CSV."
                title="Les enregistrements non attribués sont masqués dans les colonnes opérateurs, mais conservés dans les données sources et l’export CSV."
                className="rounded focus-visible:outline focus-visible:outline-2"
              >
                <Info size={14} aria-hidden="true" />
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="rrc-table-search">
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Rechercher une valeur"
              placeholder="Rechercher une valeur…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchClosed(new Set());
                setCopied(false);
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            />
          </label>
          <button className="rrc-control" data-testid="dict-csv-copy" onClick={copy}>
            Copier en CSV
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button className="rrc-control">Colonnes</button>
            </PopoverTrigger>
            <PopoverContent align="end" className="rrc-premium-popover">
              <h4 className="mb-2 text-sm font-semibold">Colonnes des groupes</h4>
              {attributed.map((column) => (
                <label key={column.id} className="flex items-center gap-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(column.id)}
                    onChange={() =>
                      setHidden((previous) =>
                        previous.includes(column.id)
                          ? previous.filter((id) => id !== column.id)
                          : [...previous, column.id],
                      )
                    }
                  />
                  {column.label}
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <span role="status" className="text-xs">
            {copied ? "CSV copié" : ""}
          </span>
        </div>
      </header>
      <div className="rrc-table-actions">
        <div className="flex flex-wrap items-center gap-2">
          <button className="rrc-control" onClick={() => expandAll(true)}>
            Tout développer
          </button>
          <button className="rrc-control" onClick={() => expandAll(false)}>
            Tout réduire
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">
            Valeurs{" "}
            <select
              className="rrc-control ml-1"
              aria-label="Ordre des valeurs"
              value={sort.key === "value" ? (sort.desc ? "desc" : "asc") : "custom"}
              onChange={(event) =>
                setSort({ ...sort, key: "value", desc: event.target.value === "desc" })
              }
            >
              <option value="asc">Croissantes</option>
              <option value="desc">Décroissantes</option>
              <option value="custom" disabled>
                Tri par colonne
              </option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Tri numérique{" "}
            <select
              aria-label="Mesure de tri"
              disabled={!visible.length}
              className="rrc-control ml-1"
              value={sort.metric ?? "count"}
              onChange={(event) =>
                setSort({
                  ...sort,
                  key: visible.some((column) => column.id === sort.key)
                    ? sort.key
                    : (visible[0]?.id ?? "value"),
                  metric: event.target.value as "count" | "percentage",
                })
              }
            >
              <option value="count">Occurrences</option>
              <option value="percentage">Pourcentage — non exposé par l’API</option>
            </select>
          </label>
        </div>
      </div>
      {model.diagnostics.length > 0 && (
        <div role="alert" className="rrc-integrity-alert">
          <strong>Incohérence des données sources</strong>
          <ul>
            {model.diagnostics.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <div
        ref={viewport}
        className="rrc-table-viewport"
        tabIndex={0}
        role="region"
        aria-label="Valeurs, tableau défilant"
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
        }}
      >
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: Math.max(500, 270 + visible.length * 150) }}
          aria-rowcount={nodes.length + 1}
        >
          <caption className="sr-only">
            Familles et paramètres repliables. Pourcentages par paramètre et groupe, avant
            recherche. L’export inclut toutes les valeurs filtrées, même repliées.
          </caption>
          <colgroup>
            <col style={{ width: visible.length ? "30%" : "100%" }} />
            {visible.map((column) => (
              <col key={column.id} style={{ width: `${70 / visible.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              {headers.map((column, index) => (
                <th
                  key={column.id}
                  scope="col"
                  className={index === 0 ? "text-left" : "text-right"}
                  aria-sort={
                    sort.key === column.id ? (sort.desc ? "descending" : "ascending") : "none"
                  }
                >
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSort({
                        ...sort,
                        key: column.id,
                        desc: sort.key === column.id && !sort.desc,
                      })
                    }
                  >
                    {"color" in column && (
                      <span
                        className="rrc-operator-dot"
                        style={{ background: column.color }}
                        aria-hidden="true"
                      />
                    )}
                    {column.label}
                    <span aria-hidden="true">
                      {sort.key === column.id ? (sort.desc ? " ↓" : " ↑") : " ↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && (
              <tr aria-hidden="true" className="rrc-virtual-space">
                <td colSpan={headers.length} style={{ height: start * ROW_HEIGHT }} />
              </tr>
            )}
            {nodes.slice(start, end).map((node, index) => {
              if (node.kind === "value")
                return (
                  <tr
                    key={node.id}
                    data-row-kind="value"
                    data-parameter-id={node.row.parameterId}
                    aria-rowindex={start + index + 2}
                  >
                    <ValueCells row={node.row} columns={visible} />
                  </tr>
                );
              const family = node.kind === "family";
              const name = family ? node.family.name : node.parameter.name;
              const count = family
                ? node.family.parameters.length
                : new Set(node.parameter.rows.map((row) => row.rawValue)).size;
              const label = family
                ? `paramètre${count > 1 ? "s" : ""}`
                : `valeur${count > 1 ? "s" : ""}`;
              return (
                <tr
                  key={node.id}
                  data-row-kind={node.kind}
                  className={family ? "rrc-family-heading" : "rrc-parameter-heading"}
                  aria-rowindex={start + index + 2}
                >
                  <th scope="row" colSpan={headers.length} className="text-left">
                    <button
                      className="rrc-hierarchy-toggle"
                      aria-expanded={node.open}
                      aria-label={`${node.open ? "Réduire" : "Développer"} ${family ? "la famille" : "le paramètre"} ${name}`}
                      title={family ? name : node.parameter.path}
                      onClick={() => toggle(node.id)}
                    >
                      {node.open ? (
                        <ChevronDown size={15} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={15} aria-hidden="true" />
                      )}
                      {family &&
                        (node.open ? (
                          <FolderOpen size={16} aria-hidden="true" />
                        ) : (
                          <Folder size={16} aria-hidden="true" />
                        ))}
                      <span className="rrc-hierarchy-name">{name}</span>
                      {!family && node.parameter.technology && (
                        <span
                          className="rrc-tech-label"
                          data-technology={node.parameter.technology}
                        >
                          {node.parameter.technology}
                        </span>
                      )}
                      <span className="rrc-hierarchy-count">
                        {count} {label}
                      </span>
                    </button>
                  </th>
                </tr>
              );
            })}
            {end < nodes.length && (
              <tr aria-hidden="true" className="rrc-virtual-space">
                <td
                  colSpan={headers.length}
                  style={{ height: (nodes.length - end) * ROW_HEIGHT }}
                />
              </tr>
            )}
            {!rows.length && (
              <tr>
                <td colSpan={headers.length} className="text-center text-muted-foreground">
                  Aucune valeur
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
