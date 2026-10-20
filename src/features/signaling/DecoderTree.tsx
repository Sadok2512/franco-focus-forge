import { useMemo, useState } from "react";

type Parameter = { path: string; value?: unknown };
type Node = { path: string; name: string; children: Map<string, Node>; parameter?: Parameter };
const display = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

export function DecoderTree({ parameters }: { parameters: Parameter[] }) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const root = useMemo(() => {
    const root: Node = { path: "", name: "", children: new Map() };
    for (const parameter of parameters) {
      let node = root;
      const parts = parameter.path.split("/");
      parts.forEach((name, i) => {
        const path = parts.slice(0, i + 1).join("/");
        if (!node.children.has(name)) node.children.set(name, { name, path, children: new Map() });
        node = node.children.get(name)!;
      });
      node.parameter = parameter;
    }
    return root;
  }, [parameters]);
  const copy = async (path: string) => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(path);
      else {
        const input = document.createElement("textarea");
        input.value = path;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        const ok = document.execCommand("copy");
        input.remove();
        if (!ok) throw new Error("clipboard unavailable");
      }
      setNotice("Chemin copié");
    } catch {
      setNotice("Copie indisponible dans ce navigateur");
    }
  };
  const query = search.trim().toLocaleLowerCase();
  const matches = (node: Node): boolean =>
    !query ||
    node.path.toLocaleLowerCase().includes(query) ||
    (node.parameter && String(display(node.parameter.value)).toLocaleLowerCase().includes(query)) ||
    [...node.children.values()].some(matches);
  const render = (nodes: Map<string, Node>) => (
    <ul className="decoder-branches">
      {[...nodes.values()].filter(matches).map((node) => (
        <li key={node.path}>
          <div className="decoder-row">
            {node.children.size > 0 ? (
              <button
                aria-label={`${collapsed.has(node.path) ? "Développer" : "Réduire"} ${node.name}`}
                aria-expanded={!!query || !collapsed.has(node.path)}
                onClick={() =>
                  setCollapsed((old) => {
                    const next = new Set(old);
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  })
                }
              >
                {query || !collapsed.has(node.path) ? "▾" : "▸"}
              </button>
            ) : (
              <span aria-hidden="true">·</span>
            )}
            <span className="min-w-0 break-words" title={node.path}>
              {node.name}
            </span>
            <span className="break-all font-mono text-primary">
              {node.parameter ? display(node.parameter.value) : ""}
            </span>
            {node.parameter && (
              <button
                className="text-muted-foreground hover:text-primary"
                aria-label={`Copier le chemin ${node.parameter.path}`}
                title="Copier le chemin ASN.1"
                onClick={() => void copy(node.parameter!.path)}
              >
                ⧉
              </button>
            )}
          </div>
          {node.children.size > 0 && (query || !collapsed.has(node.path)) && render(node.children)}
        </li>
      ))}
    </ul>
  );
  const collapseAll = () => {
    const paths = new Set<string>();
    const visit = (node: Node) => {
      if (node.children.size) paths.add(node.path);
      node.children.forEach(visit);
    };
    visit(root);
    setSearch("");
    setCollapsed(paths);
  };
  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Explorateur ASN.1">
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <input
          className="min-w-0 flex-1 rounded border bg-background px-2 py-1"
          aria-label="Rechercher dans le payload"
          placeholder="Chemin ou valeur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="kpi-button"
          onClick={() => {
            setSearch("");
            setCollapsed(new Set());
          }}
        >
          Tout développer
        </button>
        <button className="kpi-button" onClick={collapseAll}>
          Tout réduire
        </button>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {notice}
      </p>
      <div className="min-h-0 flex-1 overflow-auto py-2" data-testid="asn1-scroll">
        {[...root.children.values()].some(matches) ? (
          render(root.children)
        ) : (
          <p>Aucun chemin ou valeur correspondant.</p>
        )}
      </div>
    </div>
  );
}
