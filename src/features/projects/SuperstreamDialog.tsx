import { useMutation, useQuery } from "@tanstack/react-query";
import { Layers, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toUserMessage } from "@/lib/api/http";
import {
  createSuperstream,
  getProjectLogs,
  updateSuperstream,
  type Superstream,
} from "@/lib/api/superstreams";
import { mergeSelection, normalizeName, parsePastedFilenames, validateName } from "./superstream-model";

const PAGE = 50;
const nd = (n: number | null) => (n == null ? "N/D" : n.toLocaleString());

export function SuperstreamDialog({
  open,
  projectId,
  projectName,
  existing,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  existing: Superstream[];
  editing: Superstream | null;
  onClose: () => void;
  onSaved: (s: Superstream) => void;
}) {
  const { t } = useTranslation();
  const logsQ = useQuery({
    queryKey: ["project", projectId, "superstream-logs"],
    queryFn: ({ signal }) => getProjectLogs(projectId, signal),
    enabled: open,
  });
  const logs = useMemo(() => logsQ.data ?? [], [logsQ.data]);
  const [name, setName] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [paste, setPaste] = useState("");
  const [page, setPage] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setChecked(new Set(editing?.logIds ?? []));
    setSearch("");
    setPaste("");
    setPage(0);
    setTouched(false);
  }, [open, editing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? logs.filter((l) => l.filename.toLowerCase().includes(q)) : logs;
  }, [logs, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => setPage(0), [search]);

  const nameError = validateName(name, existing.map((s) => s.name), editing?.name);
  const pasted = useMemo(() => parsePastedFilenames(paste, logs), [paste, logs]);
  const selection = mergeSelection(checked, pasted.ids);
  const pasteBlocking = pasted.unknown.length > 0 || pasted.ambiguous.length > 0;
  const dirty =
    normalizeName(name) !== (editing?.name ?? "") ||
    paste.trim() !== "" ||
    [...checked].sort().join() !== [...(editing?.logIds ?? [])].sort().join();

  const save = useMutation({
    mutationFn: () => {
      const known = new Set(logs.map((l) => l.id));
      const input = { name: normalizeName(name), logIds: selection.filter((id) => known.has(id)) };
      return editing ? updateSuperstream(projectId, editing.id, input) : createSuperstream(projectId, input);
    },
    onSuccess: (s) => onSaved(s),
  });
  useEffect(() => { if (open) save.reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = !nameError && selection.length > 0 && !pasteBlocking && !save.isPending && logsQ.isSuccess;

  const requestClose = () => {
    if (save.isPending) return;
    if (dirty && !window.confirm(t("superstream.discardConfirm"))) return;
    onClose();
  };

  const allFilteredChecked = filtered.length > 0 && filtered.every((l) => checked.has(l.id));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
      <DialogContent
        className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-[800px] flex-col gap-0 rounded-xl p-0"
        onEscapeKeyDown={(e) => { if (save.isPending) e.preventDefault(); }}
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" aria-hidden />
            {editing ? t("superstream.editTitle") : t("superstream.createTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("superstream.subtitle", { project: projectName })}
          </DialogDescription>
        </DialogHeader>

        <form
          id="superstream-form"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (canSave) save.mutate();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="superstream-name" className="text-xs font-semibold">
              {t("superstream.name")}
            </label>
            <Input
              id="superstream-name"
              value={name}
              placeholder="Deep 1.5.0"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !!nameError}
              aria-describedby="superstream-name-error"
              autoFocus
            />
            {touched && nameError && (
              <p id="superstream-name-error" role="alert" className="text-xs text-destructive">
                {t(`superstream.nameError.${nameError}`)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold">{t("superstream.selectLogs")}</p>
              <p className="text-xs text-muted-foreground">
                {t("superstream.available", { count: logs.length })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("superstream.search")}
                  aria-label={t("superstream.search")}
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filtered.length === 0}
                onClick={() => setChecked((prev) => new Set([...prev, ...filtered.map((l) => l.id)]))}
              >
                {search.trim()
                  ? t("superstream.selectFiltered", { count: filtered.length })
                  : t("superstream.selectAll", { count: filtered.length })}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={checked.size === 0} onClick={() => setChecked(new Set())}>
                {t("superstream.clear")}
              </Button>
              <span className="text-xs font-medium text-primary" aria-live="polite">
                {t("superstream.selected", { count: selection.length })}
              </span>
            </div>

            <div className="max-h-[320px] overflow-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-9 px-3 py-2">
                      <Checkbox
                        checked={allFilteredChecked}
                        aria-label={t("superstream.toggleVisible")}
                        onCheckedChange={(v) =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            filtered.forEach((l) => (v ? next.add(l.id) : next.delete(l.id)));
                            return next;
                          })
                        }
                      />
                    </th>
                    <th className="px-3 py-2">{t("superstream.col.filename")}</th>
                    <th className="px-3 py-2 text-right">{t("superstream.col.captures")}</th>
                    <th className="px-3 py-2 text-right">{t("superstream.col.events")}</th>
                    <th className="px-3 py-2 text-right">{t("superstream.col.gps")}</th>
                    <th className="px-3 py-2">{t("superstream.col.imported")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logsQ.isPending ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{t("superstream.loadingLogs")}</td></tr>
                  ) : logsQ.isError ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-destructive" role="alert">{toUserMessage(logsQ.error)}</td></tr>
                  ) : pageRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{t("superstream.noLogs")}</td></tr>
                  ) : (
                    pageRows.map((l) => {
                      const on = checked.has(l.id) || pasted.ids.includes(l.id);
                      return (
                        <tr
                          key={l.id}
                          data-selected={on || undefined}
                          className={`h-9 cursor-pointer border-t ${on ? "bg-primary/5" : "hover:bg-muted/50"}`}
                          onClick={() => toggle(l.id)}
                        >
                          <td className="px-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={on} onCheckedChange={() => toggle(l.id)} aria-label={l.filename} />
                          </td>
                          <td className="max-w-80 truncate px-3 font-medium" title={l.filename}>{l.filename}</td>
                          <td className="px-3 text-right font-mono">{nd(l.n_captures)}</td>
                          <td className="px-3 text-right font-mono">{nd(l.n_events)}</td>
                          <td className="px-3 text-right font-mono">{nd(l.n_gps)}</td>
                          <td className="px-3 text-muted-foreground">{l.imported_at ?? "N/D"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs">
                <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</Button>
                <span>{page + 1} / {pages}</span>
                <Button type="button" variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="superstream-paste" className="text-xs font-semibold">
              {t("superstream.paste")}
            </label>
            <Textarea
              id="superstream-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="file1.nmf, file2.nmf, file3.nmf"
              rows={2}
              className="text-xs"
            />
            {pasted.unknown.length > 0 && (
              <p role="alert" className="text-xs text-destructive">
                {t("superstream.unknown")} <span className="font-mono">{pasted.unknown.join(", ")}</span>
              </p>
            )}
            {pasted.ambiguous.length > 0 && (
              <p role="alert" className="text-xs text-destructive">
                {t("superstream.ambiguous")} <span className="font-mono">{pasted.ambiguous.join(", ")}</span>
              </p>
            )}
          </div>

          {save.isError && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {toUserMessage(save.error)}
            </p>
          )}
        </form>

        <DialogFooter className="border-t px-6 py-3">
          <Button type="button" variant="outline" onClick={requestClose} disabled={save.isPending}>
            {t("superstream.cancel")}
          </Button>
          <Button type="submit" form="superstream-form" disabled={!canSave}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {editing ? t("superstream.saveChanges") : t("superstream.createTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
