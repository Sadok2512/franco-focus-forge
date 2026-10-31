import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Layers, Loader2, Search, X } from "lucide-react";
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
import { toUserMessage } from "@/lib/api/http";
import {
  createSuperstream,
  getProjectCaptures,
  replaceSuperstreamMembers,
  superstreamPreconditionStatus,
  type Superstream,
} from "@/lib/api/superstreams";
import {
  isCaptureSelectable,
  moveCapture,
  normalizeName,
  toggleCaptureOrder,
  validateName,
} from "./superstream-model";

const PAGE = 50;
const nd = (n: number | null | undefined) => (n == null ? "N/D" : n.toLocaleString());
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "N/D";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};

export function SuperstreamDialog({
  open,
  projectId,
  projectName,
  existing,
  editing,
  mode = editing ? "members" : "create",
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  existing: Superstream[];
  editing: Superstream | null;
  mode?: "create" | "members";
  onClose: () => void;
  onSaved: (s: Superstream) => void;
}) {
  const { t } = useTranslation();
  const capturesQ = useQuery({
    queryKey: ["project", projectId, "superstream-captures"],
    queryFn: ({ signal }) => getProjectCaptures(projectId, signal),
    enabled: open,
  });
  const captures = useMemo(() => capturesQ.data ?? [], [capturesQ.data]);
  const [name, setName] = useState("");
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setOrderedIds(editing?.captureIds ?? []);
    setSearch("");
    setPage(0);
    setTouched(false);
  }, [open, editing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? captures.filter((capture) =>
          `${capture.label} ${capture.captureId}`.toLowerCase().includes(q),
        )
      : captures;
  }, [captures, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => setPage(0), [search]);

  const nameError =
    mode === "create"
      ? validateName(
          name,
          existing.map((stream) => stream.name),
        )
      : null;
  const dirty =
    mode === "create"
      ? normalizeName(name) !== "" || orderedIds.length > 0
      : orderedIds.join() !== (editing?.captureIds ?? []).join();

  const save = useMutation({
    mutationFn: () => {
      if (mode === "members" && editing) {
        return replaceSuperstreamMembers(projectId, editing.id, editing.revision, orderedIds);
      }
      return createSuperstream(projectId, { name: normalizeName(name), captureIds: orderedIds });
    },
    onSuccess: onSaved,
  });
  useEffect(() => {
    if (open) save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = !nameError && orderedIds.length > 0 && !save.isPending && capturesQ.isSuccess;
  const requestClose = () => {
    if (save.isPending) return;
    if (dirty && !window.confirm(t("superstream.discardConfirm"))) return;
    onClose();
  };
  const selectableFiltered = filtered.filter(isCaptureSelectable);
  const allFilteredChecked =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((capture) => orderedIds.includes(capture.id));
  const errorStatus = superstreamPreconditionStatus(save.error);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[860px] flex-col gap-0 rounded-xl p-0"
        onEscapeKeyDown={(event) => {
          if (save.isPending) event.preventDefault();
        }}
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" aria-hidden />
            {mode === "create" ? t("superstream.createTitle") : t("superstream.editMembersTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("superstream.subtitle", { project: projectName })}
          </DialogDescription>
        </DialogHeader>

        <form
          id="superstream-form"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (canSave) save.mutate();
          }}
        >
          {mode === "create" ? (
            <div className="space-y-1">
              <label htmlFor="superstream-name" className="text-xs font-semibold">
                {t("superstream.name")}
              </label>
              <Input
                id="superstream-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
          ) : (
            <p className="text-sm font-semibold">{editing?.name}</p>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search
                  className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("superstream.searchCaptures")}
                  aria-label={t("superstream.searchCaptures")}
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectableFiltered.length === 0}
                onClick={() =>
                  setOrderedIds((current) => [
                    ...current,
                    ...selectableFiltered
                      .map((capture) => capture.id)
                      .filter((id) => !current.includes(id)),
                  ])
                }
              >
                {t("superstream.selectFiltered", { count: selectableFiltered.length })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!orderedIds.length}
                onClick={() => setOrderedIds([])}
              >
                {t("superstream.clear")}
              </Button>
              <span className="text-xs font-medium text-primary" aria-live="polite">
                {t("superstream.selected", { count: orderedIds.length })}
              </span>
            </div>

            <div className="max-h-[280px] overflow-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-9 px-3 py-2">
                      <Checkbox
                        checked={allFilteredChecked}
                        aria-label={t("superstream.toggleVisible")}
                        onCheckedChange={(checked) =>
                          setOrderedIds((current) =>
                            checked
                              ? [
                                  ...current,
                                  ...selectableFiltered
                                    .map((capture) => capture.id)
                                    .filter((id) => !current.includes(id)),
                                ]
                              : current.filter(
                                  (id) => !selectableFiltered.some((capture) => capture.id === id),
                                ),
                          )
                        }
                      />
                    </th>
                    <th className="px-3 py-2">{t("superstream.col.capture")}</th>
                    <th className="px-3 py-2">{t("superstream.col.captureId")}</th>
                    <th className="px-3 py-2 text-right">{t("superstream.col.l3Messages")}</th>
                    <th className="px-3 py-2 text-right">{t("superstream.col.records")}</th>
                    <th className="px-3 py-2 text-right">{t("superstream.col.gps")}</th>
                    <th className="px-3 py-2">{t("superstream.col.imported")}</th>
                  </tr>
                </thead>
                <tbody>
                  {capturesQ.isPending ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        {t("superstream.loadingCaptures")}
                      </td>
                    </tr>
                  ) : capturesQ.isError ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-destructive"
                        role="alert"
                      >
                        {toUserMessage(capturesQ.error)}
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        {t("superstream.noCaptures")}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((capture) => {
                      const selectable = isCaptureSelectable(capture);
                      const selected = orderedIds.includes(capture.id);
                      return (
                        <tr
                          key={capture.id}
                          data-capture-id={capture.captureId}
                          data-selected={selected || undefined}
                          className={`h-9 border-t ${!selectable ? "cursor-not-allowed bg-muted/30 text-muted-foreground" : selected ? "cursor-pointer bg-primary/5" : "cursor-pointer hover:bg-muted/50"}`}
                          title={
                            selectable
                              ? capture.label
                              : t("superstream.notSelectable", {
                                  status: capture.status ?? "unknown",
                                })
                          }
                          onClick={() => {
                            if (selectable)
                              setOrderedIds((current) => toggleCaptureOrder(current, capture.id));
                          }}
                        >
                          <td className="px-3" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selected}
                              disabled={!selectable}
                              onCheckedChange={() => {
                                if (selectable)
                                  setOrderedIds((current) =>
                                    toggleCaptureOrder(current, capture.id),
                                  );
                              }}
                              aria-label={capture.label}
                            />
                          </td>
                          <td
                            className="max-w-64 truncate px-3 font-medium"
                            title={capture.filename}
                          >
                            {capture.filename}
                          </td>
                          <td
                            className="max-w-40 truncate px-3 font-mono text-[11px]"
                            title={capture.captureId}
                          >
                            {capture.captureId}
                          </td>
                          <td className="px-3 text-right font-mono">{nd(capture.n_events)}</td>
                          <td className="px-3 text-right font-mono">{nd(capture.n_records)}</td>
                          <td className="px-3 text-right font-mono">{nd(capture.n_gps)}</td>
                          <td className="px-3 text-muted-foreground">
                            {fmtDate(capture.imported_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  ‹
                </Button>
                <span>
                  {page + 1} / {pages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  ›
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2" data-testid="superstream-capture-order">
            <p className="text-xs font-semibold">{t("superstream.captureOrder")}</p>
            {orderedIds.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {t("superstream.noSelection")}
              </p>
            ) : (
              <ol className="space-y-1 rounded-md border p-2">
                {orderedIds.map((captureId, index) => {
                  const capture = captures.find((candidate) => candidate.id === captureId);
                  return (
                    <li
                      key={captureId}
                      className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5"
                    >
                      <span className="w-5 text-right font-mono text-[11px] text-muted-foreground">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={capture?.label ?? captureId}>
                        {capture?.label ?? captureId}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        aria-label={t("superstream.moveUp")}
                        onClick={() =>
                          setOrderedIds((current) => moveCapture(current, captureId, -1))
                        }
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === orderedIds.length - 1}
                        aria-label={t("superstream.moveDown")}
                        onClick={() =>
                          setOrderedIds((current) => moveCapture(current, captureId, 1))
                        }
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={t("superstream.removeCapture")}
                        onClick={() =>
                          setOrderedIds((current) => current.filter((id) => id !== captureId))
                        }
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {save.isError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              {errorStatus === 409
                ? t("superstream.revisionConflict")
                : errorStatus === 428
                  ? t("superstream.revisionRequired")
                  : toUserMessage(save.error)}
            </p>
          )}
        </form>

        <DialogFooter className="border-t px-6 py-3">
          <Button type="button" variant="outline" onClick={requestClose} disabled={save.isPending}>
            {t("superstream.cancel")}
          </Button>
          <Button type="submit" form="superstream-form" disabled={!canSave}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === "create" ? t("superstream.create") : t("superstream.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
