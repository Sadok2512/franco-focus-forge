import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { TemplateCategory } from "@/lib/api/dict-templates";
import { templateRows } from "./template-model";
import { selectionId } from "./parameter-identity";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DictLeaf, DictTreeResponse, DictParameterNode } from "@/lib/api/dict-v2";
import { catalogParameters, messageAbbreviation } from "./catalog-model";
import { discriminatorChips, originLabel } from "./types";

function Selection({
  checked,
  partial = false,
  disabled = false,
  title,
  label,
  onChange,
}: {
  checked: boolean;
  partial?: boolean;
  disabled?: boolean;
  title?: string | undefined;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-checked={partial ? "mixed" : checked}
      onChange={onChange}
      className="h-3 w-3 shrink-0"
    />
  );
}
export function CatalogTree({
  tree,
  techno,
  needle,
  selected,
  onToggle,
  resetTick,
  templates,
}: {
  templates?: {
    categories: TemplateCategory[];
    onCategory: (category: TemplateCategory, technology: string, toggle?: boolean) => void;
    onLeaf: (leaf: DictLeaf, category: TemplateCategory, technology: string) => void;
  };
  tree: DictTreeResponse;
  techno: string;
  needle: string;
  selected: Set<string>;
  onToggle: (
    parameter: DictParameterNode,
    technology: string,
    origin: string,
    leaf?: DictLeaf,
  ) => void;
  resetTick: number;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setOpen(new Set()), [resetTick]);
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const hasSelection = (p: DictParameterNode) =>
    selected.has(p.param_key) || p.leaves.some((l) => selected.has(l.param_key));
  const match = (p: DictParameterNode) =>
    !needle ||
    [
      p.display_name,
      ...p.leaves.flatMap((l) => [l.message, ...discriminatorChips(l.discriminators)]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle.toLowerCase());
  const disclosure = (id: string, expanded: boolean, label: string) => (
    <button
      type="button"
      aria-label={`${expanded ? "Replier" : "Déplier"} ${label}`}
      aria-expanded={expanded}
      onClick={() =>
        setOpen((previous) => {
          const next = new Set(previous);
          if (expanded) {
            next.delete(id);
            next.add(`closed:${id}`);
          } else {
            next.add(id);
            next.delete(`closed:${id}`);
          }
          return next;
        })
      }
      className="shrink-0 rounded p-0.5 hover:bg-muted"
    >
      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
    </button>
  );
  if (templates)
    return (
      <TooltipProvider>
        <div className="p-2 text-xs" data-testid="dict-template-tree">
          <p role="status" className="pb-2 text-[11px] text-muted-foreground">
            Compteurs par technologie non fournis par l’API.
          </p>
          {(["LTE", "NR"] as const)
            .filter((tech) => techno === "LTE+NR" || techno === tech)
            .map((tech) => {
              const root = `template:${tech}`;
              const expandedRoot = !open.has(`closed:${root}`);
              return (
                <section key={tech} aria-label={`Templates ${tech}`}>
                  <div className="rrc-catalog-root flex items-center gap-1 rounded py-1 font-semibold">
                    {disclosure(root, expandedRoot, `Templates ${tech}`)}
                    {tech}
                  </div>
                  {expandedRoot &&
                    [...templates.categories]
                      .sort(
                        (a, b) =>
                          Number(a.id === "autres") - Number(b.id === "autres") ||
                          a.position - b.position,
                      )
                      .map((category) => {
                        const id = `${root}:${category.id}`;
                        const rows = templateRows(tree, category, tech);
                        const selectable = rows.filter((row) => row.leaf && row.n !== 0);
                        const checked =
                          selectable.length > 0 &&
                          selectable.every((row) => selected.has(selectionId(row.leaf!)));
                        const partial =
                          !checked &&
                          selectable.some((row) => selected.has(selectionId(row.leaf!)));
                        const expanded = open.has(id) && !open.has(`closed:${id}`);
                        const zero = category.n_in_project === 0;
                        const reason = zero
                          ? "0 occurrence dans ce projet / cette techno"
                          : "Compteurs par technologie non fournis par l’API";
                        return (
                          <div
                            key={id}
                            className="ml-2"
                            data-testid={`template-category-${tech}-${category.id}`}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  title={reason}
                                  className={`flex items-center gap-1 py-1 font-semibold ${zero ? "text-muted-foreground opacity-50" : ""}`}
                                >
                                  {disclosure(id, expanded, `${tech} ${category.label}`)}
                                  <Selection
                                    label={`Sélectionner ${tech} ${category.label}`}
                                    checked={checked}
                                    partial={partial}
                                    disabled={!selectable.length}
                                    onChange={() => {
                                      templates.onCategory(category, tech, true);
                                      setOpen((p) => {
                                        const next = new Set([...p, id]);
                                        next.delete(`closed:${id}`);
                                        return next;
                                      });
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() => {
                                      templates.onCategory(category, tech);
                                      setOpen((p) => {
                                        const next = new Set([...p, id]);
                                        next.delete(`closed:${id}`);
                                        return next;
                                      });
                                    }}
                                  >
                                    {category.label}
                                  </button>
                                  <span className="ml-auto w-36 shrink-0 text-right font-mono text-[10px] tabular-nums">
                                    — params · — détections
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right">{reason}</TooltipContent>
                            </Tooltip>
                            {expanded &&
                              rows.map((row) => (
                                <label
                                  key={row.id}
                                  title={
                                    row.n === 0
                                      ? "0 occurrence dans ce projet / cette techno"
                                      : row.leaf
                                        ? String(row.leaf.param_key)
                                        : "Référence absente du catalogue du projet ; compte individuel non fourni"
                                  }
                                  className={`ml-6 flex flex-wrap items-center gap-1 rounded py-1 ${row.n === 0 || !row.leaf ? "opacity-50" : ""}`}
                                  data-testid="template-leaf"
                                >
                                  <Selection
                                    label={`Sélectionner ${tech} ${row.label} ${row.message ?? ""}`}
                                    checked={!!row.leaf && selected.has(selectionId(row.leaf))}
                                    disabled={!row.leaf || row.n === 0}
                                    onChange={() =>
                                      row.leaf && templates.onLeaf(row.leaf, category, tech)
                                    }
                                  />
                                  <span className="min-w-0 break-words">{row.label}</span>
                                  {row.message && (
                                    <span
                                      className="rounded bg-accent/40 px-1 font-mono text-[10px]"
                                      title={row.message}
                                    >
                                      {messageAbbreviation(row.message)}
                                    </span>
                                  )}
                                  {discriminatorChips(row.discriminators).map((chip) => (
                                    <span className="text-[10px]" key={chip}>
                                      [{chip.replace(/^(event|reportConfig_type)=/, "")}]
                                    </span>
                                  ))}
                                  <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                                    {row.n === null ? "—" : row.n}
                                  </span>
                                </label>
                              ))}
                          </div>
                        );
                      })}
                </section>
              );
            })}
        </div>
      </TooltipProvider>
    );
  return (
    <div className="p-2 text-xs" data-testid="dict-catalog-v22">
      {tree.tree
        .filter((t) => techno === "LTE+NR" || t.techno === techno)
        .map((t) =>
          t.origins
            .filter((o) => (o.categories?.length ?? 0) > 0)
            .map((o) => {
              const root = `${t.techno}:${o.origin}`;
              const rootOpen = !open.has(`closed:${root}`);
              return (
                <section key={root} aria-label={`${t.techno} ${originLabel(o.origin)}`}>
                  <div
                    data-technology={t.techno}
                    className="rrc-catalog-root flex items-center gap-1 rounded py-1 font-semibold"
                  >
                    <button
                      aria-label={`${rootOpen ? "Replier" : "Déplier"} ${t.techno}`}
                      aria-expanded={rootOpen}
                      onClick={() => toggle(`closed:${root}`)}
                    >
                      {rootOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {t.techno}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {originLabel(o.origin)}
                    </span>
                  </div>
                  {rootOpen &&
                    [...(o.categories ?? [])]
                      .sort(
                        (a, b) =>
                          (a.id === "autres" ? 1 : 0) - (b.id === "autres" ? 1 : 0) ||
                          a.position - b.position,
                      )
                      .map((c) => {
                        const id = `${root}:${c.id}`;
                        const params = c.subcategories.flatMap((s) => s.parameters);
                        const categoryMatch = c.label.toLowerCase().includes(needle.toLowerCase());
                        if (needle && !categoryMatch && !params.some(match)) return null;
                        const expanded =
                          !open.has(`closed:${id}`) &&
                          (open.has(id) || !!needle || params.some(hasSelection));
                        return (
                          <div
                            key={id}
                            className="ml-2"
                            data-testid={`catalog-category-${t.techno}-${c.id}`}
                          >
                            <div className="flex items-center gap-1 py-1 font-semibold">
                              {disclosure(id, expanded, c.label)}
                              <span>{c.label}</span>
                              {c.id === "autres" && (
                                <span
                                  title="Pourcentage non exposé par l’API"
                                  className="ml-auto text-muted-foreground"
                                >
                                  N/D %
                                </span>
                              )}
                            </div>
                            {expanded &&
                              [...c.subcategories]
                                .sort((a, b) => a.position - b.position)
                                .map((sub) => {
                                  const sid = `${id}:${sub.id ?? sub.label}`;
                                  const matches = sub.parameters.filter(
                                    (p) =>
                                      categoryMatch ||
                                      sub.label.toLowerCase().includes(needle.toLowerCase()) ||
                                      match(p),
                                  );
                                  if (!matches.length) return null;
                                  const subOpen =
                                    !open.has(`closed:${sid}`) &&
                                    (open.has(sid) || !!needle || matches.some(hasSelection));
                                  return (
                                    <div key={sid} className="ml-3 border-l pl-1">
                                      <div className="flex items-center gap-1 py-1">
                                        {disclosure(sid, subOpen, sub.label)}
                                        <span>{sub.label}</span>
                                      </div>
                                      {subOpen &&
                                        matches.map((p) => {
                                          const parent = selected.has(p.param_key),
                                            all =
                                              p.leaves.length > 0 &&
                                              p.leaves.every((l) => selected.has(l.param_key));
                                          const partial =
                                            !parent &&
                                            !all &&
                                            p.leaves.some((l) => selected.has(l.param_key));
                                          const expanded =
                                            !open.has(`closed:${p.param_key}`) &&
                                            (open.has(p.param_key) || !!needle || hasSelection(p));
                                          const reason =
                                            p.n === 0
                                              ? "0 occurrence dans ce périmètre"
                                              : undefined;
                                          return (
                                            <div
                                              key={p.param_key}
                                              className="ml-2"
                                              data-testid={`catalog-param-${p.display_name}`}
                                              data-key={p.param_key}
                                            >
                                              <div
                                                className={`flex items-center gap-1 py-1 ${reason ? "opacity-50" : ""}`}
                                                title={reason ?? p.param_key}
                                              >
                                                {disclosure(p.param_key, expanded, p.display_name)}
                                                <Selection
                                                  label={`Sélectionner le paramètre ${p.display_name}`}
                                                  checked={parent || all}
                                                  partial={partial}
                                                  disabled={!!reason}
                                                  title={reason}
                                                  onChange={() => onToggle(p, t.techno, o.origin)}
                                                />
                                                <span className="min-w-0 flex-1 break-words">
                                                  {p.display_name}
                                                </span>
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                  n={p.n}
                                                </span>
                                              </div>
                                              {expanded &&
                                                p.leaves.map((l) => {
                                                  const reason =
                                                    l.n === 0
                                                      ? "0 occurrence dans ce périmètre"
                                                      : undefined;
                                                  return (
                                                    <label
                                                      key={l.param_key}
                                                      title={reason ?? l.sample_paths?.join("\n")}
                                                      className={`ml-6 flex flex-wrap items-center gap-1 rounded py-1 ${reason ? "opacity-50" : ""}`}
                                                      data-testid="catalog-leaf"
                                                    >
                                                      <Selection
                                                        label={`Sélectionner ${p.display_name} ${l.message} ${discriminatorChips(l.discriminators).join(" ")}`}
                                                        checked={
                                                          parent || selected.has(l.param_key)
                                                        }
                                                        disabled={!!reason}
                                                        title={reason}
                                                        onChange={() =>
                                                          onToggle(p, t.techno, o.origin, l)
                                                        }
                                                      />
                                                      <span
                                                        className="rounded bg-accent/40 px-1 font-mono text-[10px]"
                                                        title={l.message}
                                                      >
                                                        {messageAbbreviation(l.message)}
                                                      </span>
                                                      {discriminatorChips(l.discriminators).map(
                                                        (chip) => (
                                                          <span key={chip} className="text-[10px]">
                                                            [
                                                            {chip.replace(
                                                              /^(event|reportConfig_type)=/,
                                                              "",
                                                            )}
                                                            ]
                                                          </span>
                                                        ),
                                                      )}
                                                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                                        n={l.n}
                                                      </span>
                                                    </label>
                                                  );
                                                })}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  );
                                })}
                          </div>
                        );
                      })}
                </section>
              );
            }),
        )}
      {!catalogParameters(tree).length && (
        <p className="p-2 text-muted-foreground">
          Aucun paramètre dans la réponse API pour ce message.
        </p>
      )}
      <details className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">
        <summary>Messages — abréviations</summary>
        {(tree.available_messages ?? []).map((m) => (
          <div key={m}>
            <b>{messageAbbreviation(m)}</b> — {m}
          </div>
        ))}
      </details>
    </div>
  );
}
