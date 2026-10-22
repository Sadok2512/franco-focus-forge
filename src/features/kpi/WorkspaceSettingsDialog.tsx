// Workspace Settings popup (⚙ next to the tab name): Graphs + Tables tabs.
// Settings are per workspace tab and only change presentation.
// Edits stay in a local draft: nothing reaches the tables until "Apply" is clicked.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { WorkspaceLayout } from "./workspace-tabs";
import {
  DEFAULT_TABLE_SETTINGS,
  PALETTES,
  STYLE_PRESETS,
  contrastRatio,
  loadTableSettings,
  saveTableSettings,
  useTableSettings,
  type TableColors,
  type TableSettings,
} from "./table-settings";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  t,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`px-2 py-0.5 text-[11px] ${value === o ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
        >
          {t(`wss.opt_${o}`)}
        </button>
      ))}
    </div>
  );
}

function LayoutThumbs({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: 1 | 2 | 3) => void;
  label: (n: number) => string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`rounded-md border p-2 text-[11px] ${value === n ? "border-primary ring-1 ring-primary" : "border-border"}`}
        >
          <div className="mb-1 grid h-8 gap-1" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="rounded-sm bg-muted" />
            ))}
          </div>
          {label(n)}
        </button>
      ))}
    </div>
  );
}

const COLOR_KEYS: (keyof TableColors)[] = [
  "background",
  "headerBg",
  "headerText",
  "rowBg",
  "altRow",
  "border",
  "selected",
];

/** Search text is typed in the table itself and must never be gated by Apply. */
const sig = (s: TableSettings) => JSON.stringify({ ...s, search: "" });

export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  layout,
  onLayoutChange,
  columns,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  layout: WorkspaceLayout;
  onLayoutChange: (l: WorkspaceLayout) => void;
  columns: { code: string; label: string }[];
}) {
  const { t } = useTranslation();
  const [saved] = useTableSettings(workspaceId);
  const [draft, setDraft] = useState<TableSettings>(() => loadTableSettings(workspaceId));
  const [draftLayout, setDraftLayout] = useState<WorkspaceLayout>(layout);
  const [colSearch, setColSearch] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Re-open always starts from what is currently applied.
  useEffect(() => {
    if (!open) return;
    setDraft(loadTableSettings(workspaceId));
    setDraftLayout(layoutRef.current);
  }, [open, workspaceId]);

  const patch =
    <K extends keyof TableSettings>(k: K) =>
    (v: TableSettings[K]) =>
      setDraft((d) => ({ ...d, [k]: v }));
  const order = [...columns].sort((a, b) => {
    const ia = draft.order.indexOf(a.code),
      ib = draft.order.indexOf(b.code);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  const move = (from: string, to: string) => {
    const codes = order.map((c) => c.code);
    const fi = codes.indexOf(from),
      ti = codes.indexOf(to);
    if (fi < 0 || ti < 0) return;
    codes.splice(ti, 0, codes.splice(fi, 1)[0]!);
    setDraft((d) => ({ ...d, order: codes }));
  };
  const lowContrast = contrastRatio(draft.colors.headerBg, draft.colors.headerText) < 4.5;
  const dirty = draftLayout !== layout || sig(draft) !== sig(saved);
  const apply = () => {
    saveTableSettings(workspaceId, { ...draft, search: loadTableSettings(workspaceId).search });
    if (draftLayout !== layout) onLayoutChange(draftLayout);
  };
  const T = (k: string) => t(k);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-xl overflow-y-auto"
        data-testid="workspace-settings-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("wss.title")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="tables">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="graphs">{t("wss.graphs")}</TabsTrigger>
            <TabsTrigger value="tables">{t("wss.tables")}</TabsTrigger>
          </TabsList>

          <TabsContent value="graphs" className="space-y-2">
            <h4 className="text-xs font-semibold">{t("wss.graphLayout")}</h4>
            <LayoutThumbs
              value={draftLayout === "auto" ? 0 : Number(draftLayout)}
              onChange={(n) => setDraftLayout(String(n) as WorkspaceLayout)}
              label={(n) => t("wss.perRow", { n })}
            />
            <Button variant="outline" size="sm" onClick={() => setDraftLayout("auto")}>
              {t("wss.opt_auto")}
            </Button>
          </TabsContent>

          <TabsContent value="tables" className="space-y-4">
            <section>
              <h4 className="mb-1 text-xs font-semibold">{t("wss.layout")}</h4>
              <LayoutThumbs
                value={draft.perRow}
                onChange={patch("perRow")}
                label={(n) => t("wss.tablesPerRow", { n })}
              />
              <Row label={t("wss.autoFit")}>
                <Switch checked={draft.autoFitWidth} onCheckedChange={patch("autoFitWidth")} />
              </Row>
              <Row label={t("wss.equalHeights")}>
                <Switch checked={draft.equalHeights} onCheckedChange={patch("equalHeights")} />
              </Row>
              <Row label={t("wss.spacing")}>
                <Seg
                  t={T}
                  value={draft.spacing}
                  options={["compact", "normal", "wide"]}
                  onChange={patch("spacing")}
                />
              </Row>
              <Row label={t("wss.height")}>
                <Seg
                  t={T}
                  value={draft.height}
                  options={["auto", "fixed", "custom"]}
                  onChange={patch("height")}
                />
              </Row>
              {draft.height === "custom" && (
                <Row label={t("wss.customHeight")}>
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    step={20}
                    value={draft.customHeight}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        customHeight: Math.max(200, Number(e.target.value) || 480),
                      }))
                    }
                    className="w-20 rounded border border-border bg-background px-1 text-xs"
                  />
                </Row>
              )}
              <Row label={t("wss.hScroll")}>
                <Seg
                  t={T}
                  value={draft.hScroll}
                  options={["auto", "always", "off"]}
                  onChange={patch("hScroll")}
                />
              </Row>
              <Row label={t("wss.resize")}>
                <Switch checked={draft.resizable} onCheckedChange={patch("resizable")} />
              </Row>
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold">{t("wss.style")}</h4>
              <div className="grid grid-cols-3 gap-2">
                {(["clean", "professional", "compact"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={draft.style === st}
                    onClick={() => setDraft((d) => ({ ...d, style: st, ...STYLE_PRESETS[st] }))}
                    className={`rounded-md border p-2 text-left text-[11px] ${draft.style === st ? "border-primary ring-1 ring-primary" : "border-border"}`}
                  >
                    <strong className="block">{t(`wss.opt_${st}`)}</strong>
                    <span className="text-muted-foreground">{t(`wss.styleDesc_${st}`)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold">{t("wss.colors")}</h4>
              <div className="mb-2 flex flex-wrap gap-1">
                {(["white", "lightgray", "dark", "blue"] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={draft.palette === p ? "default" : "outline"}
                    onClick={() => setDraft((d) => ({ ...d, palette: p, colors: PALETTES[p] }))}
                  >
                    {t(`wss.opt_${p}`)}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={draft.palette === "custom" ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, palette: "custom" }))}
                >
                  {t("wss.opt_custom")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                {COLOR_KEYS.map((k) => (
                  <Row key={k} label={t(`wss.color_${k}`)}>
                    <input
                      type="color"
                      value={draft.colors[k]}
                      aria-label={t(`wss.color_${k}`)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          palette: "custom",
                          colors: { ...d.colors, [k]: e.target.value },
                        }))
                      }
                    />
                  </Row>
                ))}
              </div>
              {lowContrast && (
                <p className="text-[11px] text-destructive">{t("wss.lowContrast")}</p>
              )}
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold">{t("wss.appearance")}</h4>
              <Row label={t("wss.fontSize")}>
                <Seg
                  t={T}
                  value={draft.fontSize}
                  options={["small", "medium", "large"]}
                  onChange={patch("fontSize")}
                />
              </Row>
              <Row label={t("wss.rowHeight")}>
                <Seg
                  t={T}
                  value={draft.rowHeight}
                  options={["compact", "normal", "comfortable"]}
                  onChange={patch("rowHeight")}
                />
              </Row>
              <Row label={t("wss.headerHeight")}>
                <Seg
                  t={T}
                  value={draft.headerHeight}
                  options={["compact", "normal", "large"]}
                  onChange={patch("headerHeight")}
                />
              </Row>
              <Row label={t("wss.cellPadding")}>
                <Seg
                  t={T}
                  value={draft.cellPadding}
                  options={["small", "medium", "large"]}
                  onChange={patch("cellPadding")}
                />
              </Row>
              <Row label={t("wss.borders")}>
                <Seg
                  t={T}
                  value={draft.borders}
                  options={["none", "horizontal", "grid"]}
                  onChange={patch("borders")}
                />
              </Row>
              <Row label={t("wss.zebra")}>
                <Switch checked={draft.zebra} onCheckedChange={patch("zebra")} />
              </Row>
              <Row label={t("wss.stickyHeader")}>
                <Switch checked={draft.stickyHeader} onCheckedChange={patch("stickyHeader")} />
              </Row>
              <Row label={t("wss.stickyFirst")}>
                <Switch
                  checked={draft.stickyFirstColumn}
                  onCheckedChange={patch("stickyFirstColumn")}
                />
              </Row>
              <Row label={t("wss.wrap")}>
                <Switch checked={draft.wrap} onCheckedChange={patch("wrap")} />
              </Row>
              <Row label={t("wss.cellAlign")}>
                <Seg
                  t={T}
                  value={draft.cellAlign}
                  options={["left", "center", "right"]}
                  onChange={patch("cellAlign")}
                />
              </Row>
              <Row label={t("wss.numberAlign")}>
                <Seg
                  t={T}
                  value={draft.numberAlign}
                  options={["right", "center"]}
                  onChange={patch("numberAlign")}
                />
              </Row>
              <Row label={t("wss.radius")}>
                <Seg
                  t={T}
                  value={draft.radius}
                  options={["square", "rounded"]}
                  onChange={patch("radius")}
                />
              </Row>
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold">{t("wss.columns")}</h4>
              <input
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                placeholder={t("wss.columnSearch")}
                className="mb-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
              <Row label={t("wss.showUnits")}>
                <Switch checked={draft.showUnits} onCheckedChange={patch("showUnits")} />
              </Row>
              {columns.length === 0 && (
                <p className="text-[11px] text-muted-foreground">{t("wss.noColumns")}</p>
              )}
              <ul className="space-y-0.5">
                {order
                  .filter((c) => c.label.toLowerCase().includes(colSearch.toLowerCase()))
                  .map((c) => {
                    const hidden = draft.hidden.includes(c.code);
                    const sort = draft.sort?.col === c.code ? draft.sort.dir : null;
                    return (
                      <li
                        key={c.code}
                        draggable
                        onDragStart={() => setDrag(c.code)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (drag) move(drag, c.code);
                          setDrag(null);
                        }}
                        className="flex items-center gap-1 rounded border border-border px-1 py-0.5 text-xs"
                      >
                        <GripVertical size={12} className="cursor-grab text-muted-foreground" />
                        <span
                          className={`flex-1 truncate ${hidden ? "text-muted-foreground line-through" : ""}`}
                        >
                          {c.label}
                        </span>
                        <button
                          type="button"
                          title={t("wss.sortAsc")}
                          aria-label={t("wss.sortAsc")}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              sort: sort === "asc" ? null : { col: c.code, dir: "asc" },
                            }))
                          }
                          className={sort === "asc" ? "text-primary" : "text-muted-foreground"}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          title={t("wss.sortDesc")}
                          aria-label={t("wss.sortDesc")}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              sort: sort === "desc" ? null : { col: c.code, dir: "desc" },
                            }))
                          }
                          className={sort === "desc" ? "text-primary" : "text-muted-foreground"}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          title={t(hidden ? "wss.show" : "wss.hide")}
                          aria-label={t(hidden ? "wss.show" : "wss.hide")}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              hidden: hidden
                                ? d.hidden.filter((h) => h !== c.code)
                                : [...d.hidden, c.code],
                            }))
                          }
                        >
                          {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDraft({ ...DEFAULT_TABLE_SETTINGS })}
            >
              <RotateCcw size={12} /> {t("wss.reset")}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 -mb-6 flex items-center justify-between gap-2 border-t border-border bg-background px-1 pt-3 pb-1">
          <span
            data-testid="workspace-settings-status"
            className={`text-[11px] ${dirty ? "text-amber-600" : "text-muted-foreground"}`}
          >
            {t(dirty ? "wss.unsaved" : "wss.applied")}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("wss.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={apply}
              disabled={!dirty}
              data-testid="workspace-settings-apply"
            >
              {t("wss.apply")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
