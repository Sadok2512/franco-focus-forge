import { ChevronDown, ChevronRight, ListPlus, ListX, Search, TextCursorInput } from "lucide-react";
import { useMemo, useState } from "react";
import type { SigMessage, SigPayload, SigPayloadNode } from "@/lib/api/signaling-schemas";
import { fmtSec } from "./shared";

const TABS = ["Payload", "Hexadécimal", "Paramètres", "Call Flow", "Détails"] as const;
type Tab = (typeof TABS)[number];

function nodeMatches(node: SigPayloadNode, q: string): boolean {
  if (!q) return true;
  const self = `${node.key} ${node.value ?? ""}`.toLowerCase().includes(q);
  return self || (node.children ?? []).some((c) => nodeMatches(c, q));
}

function collectKeys(node: SigPayloadNode, path: string, out: Set<string>) {
  out.add(path);
  (node.children ?? []).forEach((c, i) => collectKeys(c, `${path}/${i}`, out));
}

export function PayloadTree({
  node,
  expandedKeys,
  onToggle,
  filter,
  path = "0",
  depth = 0,
  defaultOpen = false,
}: {
  node: SigPayloadNode;
  expandedKeys: Set<string>;
  onToggle: (path: string) => void;
  filter: string;
  path?: string;
  depth?: number;
  defaultOpen?: boolean;
}) {
  if (!nodeMatches(node, filter.toLowerCase())) return null;
  const children = node.children ?? [];
  const open = defaultOpen || filter.length > 0 || expandedKeys.has(path);
  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      <div className="flex items-center gap-1 py-0.5 font-mono text-[11px]">
        {children.length ? (
          <button
            aria-label={open ? `Réduire ${node.key}` : `Développer ${node.key}`}
            onClick={() => onToggle(path)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-accent-foreground">{node.key}</span>
        {node.value != null && <span className="text-primary">: {node.value}</span>}
      </div>
      {open &&
        children.map((c, i) => (
          <PayloadTree
            key={`${path}/${i}`}
            node={c}
            path={`${path}/${i}`}
            depth={depth + 1}
            expandedKeys={expandedKeys}
            onToggle={onToggle}
            filter={filter}
            defaultOpen={defaultOpen}
          />
        ))}
    </div>
  );
}

/** Inspecteur de message : payload décodé par défaut, hex, paramètres, call flow, détails. */
export function Inspector({
  message,
  payload,
  loading,
}: {
  message: SigMessage | null;
  payload: SigPayload | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Payload");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["0"]));
  const [textView, setTextView] = useState(false);

  const allKeys = useMemo(() => {
    const s = new Set<string>();
    if (payload) collectKeys(payload.decoded, "0", s);
    return s;
  }, [payload]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
        <TextCursorInput className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs font-medium">Aucun message sélectionné</p>
        <p className="text-[11px] text-muted-foreground">Cliquez un événement de la timeline ou une ligne du tableau.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-xs font-semibold">
            {message.name} <span className="num font-mono font-normal text-muted-foreground">#{message.index}</span>
          </h3>
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${message.dir === "UL" ? "bg-[#16A34A]/15 text-[#15803D]" : "bg-primary/10 text-primary"}`}>
            {message.dir}
          </span>
        </div>
        <p className="num font-mono text-[10px] text-muted-foreground">t = {fmtSec(message.t)}</p>
      </header>
      <nav className="flex gap-0.5 overflow-x-auto border-b px-2 py-1" aria-label="Onglets du payload">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && <p className="text-[11px] text-muted-foreground">Chargement du payload…</p>}
        {!loading && !payload && <p className="text-[11px] text-muted-foreground">Payload indisponible (N/D).</p>}
        {!loading && payload && tab === "Payload" && (
          <div>
            <div className="mb-2 flex items-center gap-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Rechercher dans le payload…"
                aria-label="Rechercher dans le payload"
                className="h-6 w-full rounded border bg-background px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring"
              />
              <button aria-label="Tout développer" onClick={() => setExpanded(new Set(allKeys))} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <ListPlus className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Tout réduire" onClick={() => setExpanded(new Set())} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <ListX className="h-3.5 w-3.5" />
              </button>
            </div>
            <PayloadTree node={payload.decoded} expandedKeys={expanded} onToggle={toggle} filter={filter} />
          </div>
        )}
        {!loading && payload && tab === "Hexadécimal" && (
          <pre className="num rounded border bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed">{payload.hex}</pre>
        )}
        {!loading && payload && tab === "Paramètres" && (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1">Paramètre</th>
                <th className="py-1">Valeur</th>
                <th className="py-1">Unité</th>
              </tr>
            </thead>
            <tbody>
              {payload.params.map((p) => (
                <tr key={p.key} className="border-b last:border-0">
                  <td className="py-1 font-mono">{p.key}</td>
                  <td className="num py-1 font-mono text-primary">{p.value}</td>
                  <td className="py-1 text-muted-foreground">{p.unit ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && payload && tab === "Call Flow" && (
          <ol className="space-y-2">
            {payload.call_flow.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px]">
                <span className="num w-16 shrink-0 font-mono text-muted-foreground">{fmtSec(s.t)}</span>
                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]">{s.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]">{s.to}</span>
                <span className="truncate font-medium">{s.label}</span>
              </li>
            ))}
          </ol>
        )}
        {!loading && payload && tab === "Détails" && (
          <div>
            <div className="mb-2 flex justify-end">
              <button onClick={() => setTextView((v) => !v)} className="rounded border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
                {textView ? "Vue tableau" : "+ Vue texte"}
              </button>
            </div>
            {textView ? (
              <pre className="rounded border bg-muted/50 p-2 font-mono text-[10.5px]">{JSON.stringify(payload.details, null, 2)}</pre>
            ) : (
              <table className="w-full text-[11px]">
                <tbody>
                  {Object.entries(payload.details).map(([k, v]) => (
                    <tr key={k} className="border-b last:border-0">
                      <td className="py-1 text-muted-foreground">{k}</td>
                      <td className="num py-1 text-right font-mono">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
