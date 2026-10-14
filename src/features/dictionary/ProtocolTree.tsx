import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DictFilters } from "@/lib/api/client";
import type { ParamSummary } from "@/lib/api/dictionary-schemas";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { dictQ, errMsg, fmtInt, type Selection } from "./shared";

type Row = {
  id: string;
  depth: number;
  label: string;
  kind: "branch" | "channel" | "message" | "ie" | "leaf" | "note";
  parent: string | null;
  expandable: boolean;
  techno: "LTE" | "NR";
  msgId?: string;
  msgName?: string;
  count?: number;
  paramId?: string | undefined;
  tone?: "muted" | "warn";
};

type Trie = { seg: string; children: Map<string, Trie>; paramId?: string };
function buildTrie(params: ParamSummary[]): Trie {
  const root: Trie = { seg: "", children: new Map() };
  for (const p of params) {
    const segs = p.path.split(".").filter(Boolean);
    if (!segs.length) continue;
    let node = root;
    for (const s of segs) {
      if (!node.children.has(s)) node.children.set(s, { seg: s, children: new Map() });
      node = node.children.get(s)!;
    }
    node.paramId = p.param_id;
  }
  return root;
}

export function ProtocolTree({
  projectId,
  filters,
  sel,
  onMessage,
  onParam,
}: {
  projectId: string;
  filters: DictFilters;
  sel: Selection;
  onMessage: (msgId: string, msgName: string, techno: "LTE" | "NR") => void;
  onParam: (paramId: string, msgId: string, msgName: string, techno: "LTE" | "NR") => void;
}) {
  const tree = useQuery(dictQ.tree(projectId, filters));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["LTE", "NR"]));
  const [focus, setFocus] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const searching = q.trim().length >= 2;
  const needle = q.trim().toLowerCase();

  const allMsgs = useMemo(
    () =>
      (tree.data?.branches ?? []).flatMap((b) =>
        b.channels.flatMap((c) => c.messages.map((m) => ({ ...m, techno: b.techno }))),
      ),
    [tree.data],
  );
  const loadIds = searching
    ? allMsgs.map((m) => m.msg_id)
    : allMsgs.filter((m) => open.has(`m:${m.msg_id}`)).map((m) => m.msg_id);
  const paramQs = useQueries({
    queries: loadIds.map((id) => dictQ.params(projectId, id, filters)),
  });
  const paramsBy = new Map(loadIds.map((id, i) => [id, paramQs[i]!]));

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const isOpen = (id: string) => searching || open.has(id);
    for (const b of tree.data?.branches ?? []) {
      out.push({
        id: b.techno,
        depth: 0,
        label: b.techno,
        kind: "branch",
        parent: null,
        expandable: true,
        techno: b.techno,
      });
      if (!isOpen(b.techno)) continue;
      if (!b.channels.length) {
        out.push({
          id: `${b.techno}:empty`,
          depth: 1,
          label: `Aucun paramètre ${b.techno} sur ce projet`,
          kind: "note",
          parent: b.techno,
          expandable: false,
          techno: b.techno,
          tone: "warn",
        });
        continue;
      }
      const branchTotal = b.channels.reduce(
        (a, c) => a + c.messages.reduce((x, m) => x + m.count, 0),
        0,
      );
      if (branchTotal === 0)
        out.push({
          id: `${b.techno}:filtered`,
          depth: 1,
          label: `Aucune observation ${b.techno} avec les filtres actifs`,
          kind: "note",
          parent: b.techno,
          expandable: false,
          techno: b.techno,
          tone: "warn",
        });
      let shown = 0;
      for (const c of b.channels) {
        const cid = `${b.techno}/${c.name}`;
        const msgs = c.messages.filter((m) => {
          if (!searching) return true;
          if (m.name.toLowerCase().includes(needle)) return true;
          return paramsBy
            .get(m.msg_id)
            ?.data?.params.some(
              (p) => p.leaf.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle),
            );
        });
        if (searching && !msgs.length) continue;
        shown++;
        out.push({
          id: cid,
          depth: 1,
          label: c.name,
          kind: "channel",
          parent: b.techno,
          expandable: true,
          techno: b.techno,
        });
        if (!searching && open.has(`closed:${cid}`)) continue;
        for (const m of msgs) {
          const mid = `m:${m.msg_id}`;
          out.push({
            id: mid,
            depth: 2,
            label: m.name,
            kind: "message",
            parent: cid,
            expandable: true,
            techno: b.techno,
            msgId: m.msg_id,
            msgName: m.name,
            count: m.count,
          });
          if (!isOpen(mid)) continue;
          const pq = paramsBy.get(m.msg_id);
          if (!pq || pq.isPending) {
            out.push({
              id: `${mid}:loading`,
              depth: 3,
              label: "Chargement des IE…",
              kind: "note",
              parent: mid,
              expandable: false,
              techno: b.techno,
              tone: "muted",
            });
            continue;
          }
          if (pq.isError) {
            out.push({
              id: `${mid}:err`,
              depth: 3,
              label: `IE indisponibles — ${errMsg(pq.error)}`,
              kind: "note",
              parent: mid,
              expandable: false,
              techno: b.techno,
              tone: "warn",
            });
            continue;
          }
          const ps = (pq.data?.params ?? []).filter(
            (p) =>
              !searching ||
              m.name.toLowerCase().includes(needle) ||
              p.leaf.toLowerCase().includes(needle) ||
              p.path.toLowerCase().includes(needle),
          );
          const trie = buildTrie(ps);
          if (!trie.children.size) {
            out.push({
              id: `${mid}:none`,
              depth: 3,
              label: "IE indisponibles — aucun chemin ASN.1 retourné",
              kind: "note",
              parent: mid,
              expandable: false,
              techno: b.techno,
              tone: "warn",
            });
            continue;
          }
          const walk = (n: Trie, depth: number, prefix: string, parent: string) => {
            for (const ch of n.children.values()) {
              const id = `${mid}:${prefix}${ch.seg}`;
              const isLeaf = !!ch.paramId && !ch.children.size;
              out.push({
                id,
                depth,
                label: ch.seg,
                kind: isLeaf ? "leaf" : "ie",
                parent,
                expandable: !isLeaf,
                techno: b.techno,
                msgId: m.msg_id,
                msgName: m.name,
                paramId: ch.paramId,
              });
              if (!isLeaf && (searching || open.has(id) || !open.has(`closed:${id}`)))
                walk(ch, depth + 1, `${prefix}${ch.seg}.`, id);
            }
          };
          walk(trie, 3, "", mid);
        }
      }
      if (searching && !shown && b.channels.length)
        out.push({
          id: `${b.techno}:nomatch`,
          depth: 1,
          label: "Aucun résultat",
          kind: "note",
          parent: b.techno,
          expandable: false,
          techno: b.techno,
          tone: "muted",
        });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tree.data,
    open,
    searching,
    needle,
    paramQs.map((p) => p.dataUpdatedAt + ":" + p.status).join("|"),
  ]);

  const isExpanded = (r: Row) =>
    r.kind === "ie" || r.kind === "channel"
      ? searching || !open.has(`closed:${r.id}`)
      : searching || open.has(r.id);
  const toggle = (r: Row) =>
    setOpen((s) => {
      const n = new Set(s);
      const k = r.kind === "ie" || r.kind === "channel" ? `closed:${r.id}` : r.id;
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const activate = (r: Row) => {
    if (r.kind === "message") {
      onMessage(r.msgId!, r.msgName!, r.techno);
      if (!open.has(r.id)) toggle(r);
    } else if (r.kind === "leaf" && r.paramId) onParam(r.paramId, r.msgId!, r.msgName!, r.techno);
    else if (r.expandable) toggle(r);
  };
  const focusRow = (i: number) => {
    const c = Math.max(0, Math.min(rows.length - 1, i));
    setFocus(c);
    listRef.current?.querySelectorAll<HTMLElement>("[role=treeitem]")[c]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number, r: Row) => {
    const k = e.key;
    if (k === "ArrowDown") focusRow(i + 1);
    else if (k === "ArrowUp") focusRow(i - 1);
    else if (k === "Home") focusRow(0);
    else if (k === "End") focusRow(rows.length - 1);
    else if (k === "ArrowRight") {
      if (r.expandable && !isExpanded(r)) toggle(r);
      else focusRow(i + 1);
    } else if (k === "ArrowLeft") {
      if (r.expandable && isExpanded(r)) toggle(r);
      else if (r.parent) focusRow(rows.findIndex((x) => x.id === r.parent));
    } else if (k === "Enter" || k === " ") activate(r);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <label className="relative block">
          <span className="sr-only">Rechercher message, IE ou chemin ASN.1</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Message, IE, chemin ASN.1…"
            className="h-7 w-full rounded-md border border-input bg-card pl-8 pr-2 font-mono text-[11px]"
          />
        </label>
        {searching && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Recherche dans les noms de messages, feuilles IE et chemins ASN.1 retournés par l'API.
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {tree.isPending && (
          <div className="space-y-1.5 p-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <LoadingSkeleton key={i} className="h-5" />
            ))}
          </div>
        )}
        {tree.isError && <ErrorState message={errMsg(tree.error)} onRetry={() => tree.refetch()} />}
        {tree.data && (
          <ul ref={listRef} role="tree" aria-label="Explorateur de protocole RRC">
            {rows.map((r, i) => {
              const selected =
                (r.kind === "message" && sel.msgId === r.msgId && !sel.paramId) ||
                (r.kind === "leaf" && sel.paramId === r.paramId);
              if (r.kind === "note")
                return (
                  <li
                    key={r.id}
                    role="none"
                    style={{ paddingLeft: 8 + r.depth * 12 }}
                    className={`py-1 pr-2 text-[11px] ${r.tone === "warn" ? "text-warning-foreground" : "text-muted-foreground"} italic`}
                  >
                    {r.label}
                  </li>
                );
              return (
                <li
                  key={r.id}
                  role="treeitem"
                  aria-level={r.depth + 1}
                  aria-selected={selected}
                  aria-expanded={r.expandable ? isExpanded(r) : undefined}
                  tabIndex={i === focus ? 0 : -1}
                  onKeyDown={(e) => onKey(e, i, r)}
                  onFocus={() => setFocus(i)}
                  onClick={() => {
                    setFocus(i);
                    activate(r);
                  }}
                  title={r.kind === "leaf" || r.kind === "ie" ? r.label : undefined}
                  style={{ paddingLeft: 4 + r.depth * 12 }}
                  className={`flex cursor-pointer items-center gap-1 rounded py-[3px] pr-1.5 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"}`}
                >
                  <span
                    className="flex w-3.5 shrink-0 justify-center text-muted-foreground"
                    onClick={(e) => {
                      if (r.expandable && r.kind === "message") {
                        e.stopPropagation();
                        toggle(r);
                      }
                    }}
                  >
                    {r.expandable ? (
                      isExpanded(r) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )
                    ) : (
                      <span aria-hidden>·</span>
                    )}
                  </span>
                  {r.kind === "branch" ? (
                    <span
                      className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wider ${r.techno === "LTE" ? "bg-primary text-primary-foreground" : "bg-sev-good text-primary-foreground"}`}
                    >
                      {r.label}
                    </span>
                  ) : (
                    <span
                      className={`min-w-0 truncate ${r.kind === "channel" ? "font-semibold text-muted-foreground" : ""} ${r.kind === "ie" || r.kind === "leaf" ? "font-mono text-[11px]" : ""} ${r.kind === "message" && r.count === 0 ? "text-muted-foreground" : ""}`}
                    >
                      {r.label}
                    </span>
                  )}
                  {r.kind === "message" && (
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {r.count! > 0 && (
                        <span className="rounded-sm border border-sev-good/40 px-1 text-[9px] font-semibold uppercase text-sev-good">
                          Observé
                        </span>
                      )}
                      <span
                        className="num font-mono text-[10px] text-muted-foreground"
                        aria-label={`${r.count} occurrences`}
                      >
                        {fmtInt(r.count!)}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
