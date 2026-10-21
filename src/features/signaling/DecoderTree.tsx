import { useMemo, useState } from "react";

type Parameter = {
  path: string;
  value?: unknown;
  // 0.72.0 — nouvelles clés remontées par le back pour les NAS sanitized.
  redacted_reason?: string | null | undefined;
  param_key?: string | null | undefined;
};
type Node = {
  path: string;
  name: string;
  children: Map<string, Node>;
  parameter?: Parameter;
};
const display = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

// 1.68.0 — Références 3GPP par IE (allowlist statique, match sur leaf name).
// Spec TS 24.007/24.301/24.501/24.008. Ne fabrique rien : si l'IE n'est pas
// dans ce dictionnaire, pas de référence affichée.
const TS_REFS: Record<string, string> = {
  SecHdr: "TS 24.007 §11.2.3.1.1",
  ProtDisc: "TS 24.007 §11.2.3.1.1",
  Type: "TS 24.301 §9.8",
  EMMCause: "TS 24.301 §9.9.3.9",
  ESMCause: "TS 24.301 §9.9.4.4",
  EpsAttachType: "TS 24.301 §9.9.3.11",
  EpsUpdateType: "TS 24.301 §9.9.3.14",
  DetachType: "TS 24.301 §9.9.3.6",
  ServiceType: "TS 24.301 §9.9.3.27",
  EPSBearerIdentity: "TS 24.301 §9.9.3.6",
  BearerId: "TS 24.301 §9.9.3.6",
  PTI: "TS 24.007 §11.2.3.1.3",
  QoS: "TS 24.008 §10.5.6.5",
  ApnAmbr: "TS 24.301 §9.9.4.2",
  PDNType: "TS 24.301 §9.9.4.10",
  RequestType: "TS 24.301 §9.9.4.14",
  UENetCap: "TS 24.301 §9.9.3.34",
  NAS_SecurityAlgorithms: "TS 24.301 §9.9.3.23",
  DRXParam: "TS 24.008 §10.5.5.6",
  MSCm2: "TS 24.008 §10.5.1.6",
  MSCm3: "TS 24.008 §10.5.1.7",
  MSNetCap: "TS 24.008 §10.5.5.12",
  MSNetFeatSupp: "TS 24.008 §10.5.1.15",
  VoiceDomPref: "TS 24.008 §10.5.5.24",
  SuppCodecs: "TS 24.008 §10.5.4.32",
  PLMN: "TS 24.008 §10.5.1.3",
  TSC: "TS 24.301 §9.9.3.21",
  SeqnShort: "TS 24.301 §9.9.3.25",
  EEA0: "TS 24.301 §9.9.3.34",
  EEA1_128: "TS 24.301 §9.9.3.34",
  EEA2_128: "TS 24.301 §9.9.3.34",
  EEA3_128: "TS 24.301 §9.9.3.34",
  EIA0: "TS 24.301 §9.9.3.34",
  EIA1_128: "TS 24.301 §9.9.3.34",
  EIA2_128: "TS 24.301 §9.9.3.34",
  EIA3_128: "TS 24.301 §9.9.3.34",
  // 5G NR
  FGMMCause: "TS 24.501 §9.11.3.2",
  FGMMHeader: "TS 24.501 §9.1.1",
  // RRC side (quelques classiques)
  mobilityControlInfo: "TS 36.331 §6.3.4",
  measurementReport: "TS 36.331 §6.2.2",
  securityAlgorithmConfig: "TS 36.331 §6.3.3",
  sCellToAddModList: "TS 36.331 §6.3.5",
};

// Last path segment is the leaf IE name used as TS ref key.
const refFor = (name: string): string | null => TS_REFS[name] ?? null;

export function DecoderTree({ parameters }: { parameters: Parameter[] }) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // 1.68.0 — Par défaut : collapse tous les conteneurs sauf la racine.
    // UX : les 150+ IE d'un ATTACH_REQUEST noient l'utilisateur si tout ouvert.
    const paths = new Set<string>();
    for (const p of parameters) {
      const parts = p.path.split("/");
      // Collapse every intermediate container EXCEPT the root (depth 1).
      for (let i = 2; i < parts.length; i++) paths.add(parts.slice(0, i).join("/"));
    }
    return paths;
  });
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

  // 1.68.0 — Compte statut REDACTED/SAFE total pour le badge en haut.
  const stats = useMemo(() => {
    let redacted = 0;
    let safe = 0;
    for (const p of parameters) {
      if (p.redacted_reason) redacted++;
      else if (p.value !== undefined) safe++;
    }
    return { redacted, safe, total: safe + redacted };
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

  const renderValue = (parameter: Parameter) => {
    if (parameter.redacted_reason) {
      return (
        <span
          className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200"
          title={parameter.redacted_reason}
        >
          🔒 REDACTED
        </span>
      );
    }
    const v = display(parameter.value);
    if (v?.startsWith("<binary")) {
      return (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          {v}
        </span>
      );
    }
    return <span className="break-all font-mono text-primary">{v}</span>;
  };

  const render = (nodes: Map<string, Node>, depth = 0) => (
    <ul
      className={`decoder-branches ${depth > 0 ? "ml-3 border-l border-dashed border-muted-foreground/30 pl-2" : ""}`}
    >
      {[...nodes.values()].filter(matches).map((node) => {
        const open = !!query || !collapsed.has(node.path);
        const ref = refFor(node.name);
        const isContainer = node.children.size > 0;
        return (
          <li key={node.path}>
            <div className="decoder-row flex items-center gap-1.5 py-0.5">
              {isContainer ? (
                <button
                  className="w-4 shrink-0 text-xs text-muted-foreground hover:text-primary"
                  aria-label={`${open ? "Réduire" : "Développer"} ${node.name}`}
                  aria-expanded={open}
                  onClick={() =>
                    setCollapsed((old) => {
                      const next = new Set(old);
                      if (next.has(node.path)) next.delete(node.path);
                      else next.add(node.path);
                      return next;
                    })
                  }
                >
                  {open ? "▾" : "▸"}
                </button>
              ) : (
                <span className="w-4 shrink-0 text-xs text-muted-foreground" aria-hidden="true">
                  ·
                </span>
              )}
              <span
                className={`min-w-0 break-words ${isContainer ? "font-semibold" : ""}`}
                title={node.path}
              >
                {node.name}
                {node.children.size > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({node.children.size})
                  </span>
                )}
              </span>
              {node.parameter && renderValue(node.parameter)}
              {ref && (
                <span
                  className="rounded border border-muted-foreground/30 px-1 text-[9px] text-muted-foreground"
                  title="Référence 3GPP"
                >
                  {ref}
                </span>
              )}
              {node.parameter && (
                <button
                  className="ml-auto text-muted-foreground hover:text-primary"
                  aria-label={`Copier le chemin ${node.parameter.path}`}
                  title="Copier le chemin ASN.1"
                  onClick={() => void copy(node.parameter!.path)}
                >
                  ⧉
                </button>
              )}
            </div>
            {node.children.size > 0 && open && render(node.children, depth + 1)}
          </li>
        );
      })}
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
        {stats.redacted > 0 && (
          <span
            className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200"
            title="CLAUDE.md P0 : identités et secrets de sécurité masqués"
          >
            🔒 {stats.redacted}/{stats.total} masqués
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {notice}
      </p>
      <div className="min-h-0 flex-1 overflow-auto py-2 text-xs" data-testid="asn1-scroll">
        {[...root.children.values()].some(matches) ? (
          render(root.children)
        ) : (
          <p>Aucun chemin ou valeur correspondant.</p>
        )}
      </div>
    </div>
  );
}
