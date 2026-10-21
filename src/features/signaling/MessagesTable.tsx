import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  ListPlus,
  ListX,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { SigMessage, SigPayload } from "@/lib/api/signaling-schemas";
import { fmtNum } from "./shared";
import { PayloadTree } from "./Inspector";

type ColKey = "dir" | "layer" | "procedure" | "ecgi" | "earfcn" | "rsrp" | "rsrq" | "sinr" | "octets";

const COLS: { key: ColKey; label: string; w: string }[] = [
  { key: "dir", label: "Sens", w: "w-14" },
  { key: "layer", label: "Couche", w: "w-24" },
  { key: "procedure", label: "Procédure", w: "w-20" },
  { key: "ecgi", label: "ECGI / PCI", w: "w-32" },
  { key: "earfcn", label: "EARFCN", w: "w-20" },
  { key: "rsrp", label: "RSRP (dBm)", w: "w-20" },
  { key: "rsrq", label: "RSRQ (dB)", w: "w-20" },
  { key: "sinr", label: "SINR (dB)", w: "w-20" },
  { key: "octets", label: "Octets", w: "w-16" },
];

const LAYER_CLS: Record<string, string> = {
  NAS: "bg-[#F97316]/15 text-[#C2410C]",
  "RRC NR": "bg-primary/10 text-primary",
  "RRC LTE": "bg-primary/10 text-primary",
  RRC: "bg-primary/10 text-primary",
  "MAC-RACH": "bg-[#16A34A]/15 text-[#15803D]",
  "Événements Nemo": "bg-muted text-muted-foreground",
};

export function MessagesTable({
  messages,
  total,
  selectedIndex,
  onSelect,
  getPayload,
}: {
  messages: SigMessage[];
  total: number;
  selectedIndex: number | null;
  onSelect: (m: SigMessage) => void;
  getPayload: (index: number) => Promise<SigPayload>;
}) {
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ key: "index" | "t" | "name"; dir: "asc" | "desc" }>({ key: "index", dir: "asc" });
  const [visible, setVisible] = useState<Set<ColKey>>(new Set(COLS.map((c) => c.key)));
  const [colsOpen, setColsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [inlinePayloads, setInlinePayloads] = useState<Record<number, SigPayload>>({});
  const colsRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = q
      ? messages.filter((m) => `${m.name} ${m.procedure} ${m.layer}`.toLowerCase().includes(q))
      : [...messages];
    rows.sort((a, b) => {
      const k = sort.key;
      const cmp =
        k === "name" ? a.name.localeCompare(b.name, "fr") : (a[k] as number) - (b[k] as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [messages, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Le nom du message suit toujours la couche : un seul ordre pour l'en-tête et les lignes.
  const orderedCols = COLS.filter((c) => visible.has(c.key));
  const nameAfter = (() => {
    const l = orderedCols.findIndex((c) => c.key === "layer");
    if (l >= 0) return l + 1;
    return orderedCols.findIndex((c) => c.key === "dir") + 1;
  })();

  const renderCell = (key: ColKey, m: SigMessage) => {
    switch (key) {
      case "dir":
        return (
          <td className="px-2 py-1.5">
            <span className={`flex items-center gap-1 font-medium ${m.dir === "UL" ? "text-[#15803D]" : "text-primary"}`}>
              {m.dir === "UL" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {m.dir}
            </span>
          </td>
        );
      case "layer":
        return (
          <td className="px-2 py-1.5">
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${LAYER_CLS[m.layer] ?? "bg-muted text-muted-foreground"}`}>{m.layer}</span>
          </td>
        );
      case "procedure":
        return <td className="truncate px-2 py-1.5">{m.procedure}</td>;
      case "ecgi":
        return (
          <td className="num truncate px-2 py-1.5 font-mono">
            {m.ecgi ?? "N/D"} / {m.pci ?? "N/D"}
          </td>
        );
      case "earfcn":
        return <td className="num px-2 py-1.5 font-mono">{m.earfcn ?? "N/D"}</td>;
      case "rsrp":
        return <td className={`num px-2 py-1.5 font-mono ${m.rsrp != null && m.rsrp < -100 ? "text-destructive" : ""}`}>{m.rsrp ?? "N/D"}</td>;
      case "rsrq":
        return <td className={`num px-2 py-1.5 font-mono ${m.rsrq != null && m.rsrq < -14 ? "text-destructive" : ""}`}>{m.rsrq ?? "N/D"}</td>;
      case "sinr":
        return <td className={`num px-2 py-1.5 font-mono ${m.sinr != null && m.sinr < 0 ? "text-destructive" : ""}`}>{m.sinr ?? "N/D"}</td>;
      case "octets":
        return <td className="num px-2 py-1.5 font-mono">{m.octets}</td>;
    }
  };

  // Clic timeline → la sélection reste visible : on bascule sur sa page.
  useEffect(() => {
    if (selectedIndex == null) return;
    const pos = filtered.findIndex((m) => m.index === selectedIndex);
    if (pos >= 0) setPage(Math.floor(pos / pageSize) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex == null) return;
    const el = rowRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, safePage]);

  const toggleSort = (key: "index" | "t" | "name") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const exportCsv = () => {
    const head = ["#", "Temps (s)", "Sens", "Couche", "Message", "Procédure", "ECGI / PCI", "EARFCN", "RSRP (dBm)", "RSRQ (dB)", "SINR (dB)", "Octets"];
    const nd = (v: number | null) => (v == null ? "N/D" : String(v).replace(".", ","));
    const lines = filtered.map((m) =>
      [m.index, String(m.t).replace(".", ","), m.dir, m.layer, m.name, m.procedure, `${m.ecgi ?? "N/D"} / ${m.pci ?? "N/D"}`, nd(m.earfcn), nd(m.rsrp), nd(m.rsrq), nd(m.sinr), m.octets].join(";"),
    );
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `messages_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleExpand = async (m: SigMessage) => {
    const next = new Set(expanded);
    if (next.has(m.index)) next.delete(m.index);
    else {
      next.add(m.index);
      if (!inlinePayloads[m.index]) {
        try {
          const p = await getPayload(m.index);
          setInlinePayloads((prev) => ({ ...prev, [m.index]: p }));
        } catch {
          /* l'inspecteur reste la source principale */
        }
      }
    }
    setExpanded(next);
  };

  const expandAll = async () => {
    const next = new Set(expanded);
    const targets = slice.filter((m) => !next.has(m.index));
    for (const m of targets) next.add(m.index);
    setExpanded(next);
    const missing = targets.filter((m) => !inlinePayloads[m.index]);
    if (missing.length) {
      const results = await Promise.allSettled(missing.map((m) => getPayload(m.index)));
      const add: Record<number, SigPayload> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") add[missing[i]!.index] = r.value;
      });
      setInlinePayloads((prev) => ({ ...prev, ...add }));
    }
  };

  const collapseAll = () => setExpanded(new Set());

  const sortIcon = (key: "index" | "t" | "name") =>
    sort.key !== key ? (
      <ArrowUpDown className="h-3 w-3 opacity-40" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );

  const pageNumbers = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - safePage) <= 2) out.push(p);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [pages, safePage]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col" aria-label="Messages">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h3 className="text-xs font-semibold">
          Messages ({fmtNum(filtered.length)}
          {filtered.length !== total ? ` / ${fmtNum(total)}` : ""})
        </h3>
        <button
          aria-label="Filtrer les messages"
          aria-pressed={filterOpen}
          onClick={() => setFilterOpen((v) => !v)}
          className={`rounded p-1 hover:bg-muted ${filterOpen ? "text-primary" : "text-muted-foreground"}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <div className="relative" ref={colsRef}>
            <button
              aria-label="Colonnes affichées"
              aria-expanded={colsOpen}
              onClick={() => setColsOpen((v) => !v)}
              className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              <Columns3 className="h-3.5 w-3.5" /> Colonnes
            </button>
            {colsOpen && (
              <div className="absolute right-0 top-8 z-20 w-44 rounded-md border bg-popover p-1 shadow-lg">
                {COLS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={visible.has(c.key)}
                      onChange={() =>
                        setVisible((v) => {
                          const n = new Set(v);
                          if (n.has(c.key)) n.delete(c.key);
                          else n.add(c.key);
                          return n;
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={exportCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button onClick={expandAll} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
            <ListPlus className="h-3.5 w-3.5" /> Tout développer
          </button>
          <button onClick={collapseAll} aria-label="Tout réduire" className="rounded border p-1 text-muted-foreground hover:bg-muted">
            <ListX className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      {filterOpen && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Nom du message, procédure, couche…"
            aria-label="Rechercher un message"
            className="h-7 w-64 rounded border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed text-[11px]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-8 px-1 py-1.5" />
              <th className="w-12 cursor-pointer px-2 py-1.5" onClick={() => toggleSort("index")}>
                <span className="flex items-center gap-1"># {sortIcon("index")}</span>
              </th>
              <th className="w-20 cursor-pointer px-2 py-1.5" onClick={() => toggleSort("t")}>
                <span className="flex items-center gap-1">Temps (s) {sortIcon("t")}</span>
              </th>
              {nameAfter === 0 && (
                <th className="cursor-pointer px-2 py-1.5" onClick={() => toggleSort("name")}>
                  <span className="flex items-center gap-1">Message {sortIcon("name")}</span>
                </th>
              )}
              {orderedCols.map((c, i) => (
                <Fragment key={c.key}>
                  <th className={`${c.w} px-2 py-1.5`}>{c.label}</th>
                  {i + 1 === nameAfter && (
                    <th className="cursor-pointer px-2 py-1.5" onClick={() => toggleSort("name")}>
                      <span className="flex items-center gap-1">Message {sortIcon("name")}</span>
                    </th>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((m) => {
              const selected = m.index === selectedIndex;
              const isOpen = expanded.has(m.index);
              return [
                <tr
                  key={m.index}
                  ref={(el) => {
                    if (el) rowRefs.current.set(m.index, el);
                    else rowRefs.current.delete(m.index);
                  }}
                  onClick={() => onSelect(m)}
                  className={`cursor-pointer border-b last:border-0 ${selected ? "bg-accent" : "hover:bg-muted/60"}`}
                  aria-selected={selected}
                >
                  <td className="px-1 py-1.5">
                    <button
                      aria-label={isOpen ? "Réduire le message" : "Développer le message"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleExpand(m);
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className="num px-2 py-1.5 font-mono">{m.index}</td>
                  <td className="num px-2 py-1.5 font-mono">{m.t.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                  {nameAfter === 0 && <td className="truncate px-2 py-1.5 font-medium">{m.name}</td>}
                  {orderedCols.map((c, i) => (
                    <Fragment key={c.key}>
                      {renderCell(c.key, m)}
                      {i + 1 === nameAfter && <td className="truncate px-2 py-1.5 font-medium">{m.name}</td>}
                    </Fragment>
                  ))}
                </tr>,
                ...(isOpen
                  ? [
                      <tr key={`${m.index}-payload`} className="border-b bg-muted/40">
                        <td colSpan={3 + visible.size + 1} className="px-6 py-2">
                          {inlinePayloads[m.index] ? (
                            <PayloadTree node={inlinePayloads[m.index]!.decoded} expandedKeys={new Set()} onToggle={() => {}} filter="" defaultOpen />
                          ) : (
                            <span className="text-muted-foreground">Chargement du payload…</span>
                          )}
                        </td>
                      </tr>,
                    ]
                  : []),
              ];
            })}
            {!slice.length && (
              <tr>
                <td colSpan={3 + visible.size + 1} className="px-3 py-8 text-center text-muted-foreground">
                  Aucun message ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center gap-1 border-t px-3 py-1.5 text-[11px]">
        <button aria-label="Page précédente" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageNumbers.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => setPage(p)}
              aria-current={p === safePage ? "page" : undefined}
              className={`h-6 min-w-6 rounded px-1 ${p === safePage ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {p}
            </button>
          ),
        )}
        <button aria-label="Page suivante" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} className="rounded p-1 hover:bg-muted disabled:opacity-40">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          <select
            aria-label="Lignes par page"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-6 rounded border bg-background px-1"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>
      </footer>
    </section>
  );
}
