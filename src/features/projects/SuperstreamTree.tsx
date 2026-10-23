import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Folder, Layers, MoreVertical, Pencil, Trash2, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toUserMessage } from "@/lib/api/http";
import { deleteSuperstream, getProjectLogs, listSuperstreams, type Superstream } from "@/lib/api/superstreams";
import { SuperstreamDialog } from "./SuperstreamDialog";

const EXP_KEY = "bc4.superstreams.expanded";
function readExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(EXP_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export const superstreamsKey = (projectId: string) => ["project", projectId, "superstreams"] as const;

export function SuperstreamTree({
  projectId,
  projectName,
  highlightId,
}: {
  projectId: string;
  projectName: string;
  highlightId?: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: superstreamsKey(projectId), queryFn: ({ signal }) => listSuperstreams(projectId, signal) });
  const logsQ = useQuery({
    queryKey: ["project", projectId, "superstream-logs"],
    queryFn: ({ signal }) => getProjectLogs(projectId, signal),
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => setExpanded(readExpanded()), []);
  const toggle = (key: string, force?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      const on = force ?? !next.has(key);
      if (on) next.add(key);
      else next.delete(key);
      sessionStorage.setItem(EXP_KEY, JSON.stringify([...next]));
      return next;
    });
  useEffect(() => {
    if (highlightId) toggle(`${projectId}:streams`, true);
  }, [highlightId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState<Superstream | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Superstream | null>(null);
  const del = useMutation({
    mutationFn: (s: Superstream) => deleteSuperstream(projectId, s.id),
    onSuccess: () => {
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: superstreamsKey(projectId) });
      toast.success(t("superstream.deleted"));
    },
  });

  const list = listQ.data ?? [];
  const logs = logsQ.data ?? [];
  const nameOf = (id: string) => logs.find((l) => l.id === id)?.filename ?? id;
  const streamsKey = `${projectId}:streams`;
  const logsKey = `${projectId}:logs`;
  const Chevron = ({ open }: { open: boolean }) =>
    open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />;
  const Badge = ({ n }: { n: number }) => (
    <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{n}</span>
  );

  return (
    <div className="rounded-md border bg-background p-3 text-xs" data-testid="superstream-tree">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Folder className="h-3.5 w-3.5 text-primary" aria-hidden /> {projectName}
      </p>
      <ul role="tree" className="ml-2 space-y-0.5 border-l pl-2">
        <li role="treeitem" aria-expanded={expanded.has(streamsKey)}>
          <button type="button" className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted" onClick={() => toggle(streamsKey)}>
            <Chevron open={expanded.has(streamsKey)} />
            <Layers className="h-3.5 w-3.5 text-primary" aria-hidden /> {t("superstream.branch")} <Badge n={list.length} />
          </button>
          {expanded.has(streamsKey) && (
            <ul role="group" className="ml-3 space-y-0.5 border-l pl-2">
              {listQ.isPending && <li className="text-muted-foreground">{t("superstream.loading")}</li>}
              {listQ.isError && <li className="text-destructive" role="alert">{toUserMessage(listQ.error)}</li>}
              {listQ.isSuccess && list.length === 0 && <li className="px-1 text-muted-foreground">{t("superstream.empty")}</li>}
              {list.map((s) => {
                const key = `${projectId}:ss:${s.id}`;
                const open = expanded.has(key);
                return (
                  <li key={s.id} role="treeitem" aria-expanded={open} data-superstream={s.name}>
                    <div className={`group flex items-center gap-1 rounded ${s.id === highlightId ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}>
                      <button type="button" className="flex flex-1 items-center gap-1.5 px-1 py-0.5 text-left hover:bg-muted" onClick={() => toggle(key)}>
                        <Chevron open={open} />
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{s.name}</span> <Badge n={s.logIds.length} />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={t("superstream.actionsFor", { name: s.name })} className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted">
                            <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => toggle(key, true)}>
                            <Eye className="h-4 w-4" aria-hidden /> {t("superstream.viewLogs")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(() => setEditing(s), 0); }}>
                            <Pencil className="h-4 w-4" aria-hidden /> {t("superstream.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(() => setEditing(s), 0); }}>
                            <Pencil className="h-4 w-4" aria-hidden /> {t("superstream.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            onSelect={(e) => { e.preventDefault(); setTimeout(() => setPendingDelete(s), 0); }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden /> {t("superstream.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {open && (
                      <ul role="group" className="ml-5 border-l pl-2">
                        {s.logIds.map((id) => (
                          <li key={id} role="treeitem" className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
                            <FileText className="h-3 w-3" aria-hidden />
                            <span className="truncate font-mono" title={nameOf(id)}>{nameOf(id)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
        <li role="treeitem" aria-expanded={expanded.has(logsKey)}>
          <button type="button" className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted" onClick={() => toggle(logsKey)}>
            <Chevron open={expanded.has(logsKey)} />
            <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {t("superstream.logsBranch")} <Badge n={logs.length} />
          </button>
          {expanded.has(logsKey) && (
            <ul role="group" className="ml-5 border-l pl-2">
              {logs.map((l) => (
                <li key={l.id} role="treeitem" className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
                  <FileText className="h-3 w-3" aria-hidden />
                  <span className="truncate font-mono" title={l.filename}>{l.filename}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>

      <SuperstreamDialog
        open={editing !== null}
        projectId={projectId}
        projectName={projectName}
        existing={list}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void qc.invalidateQueries({ queryKey: superstreamsKey(projectId) });
          toast.success(t("superstream.saved"));
        }}
      />
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => { if (!o && !del.isPending) { setPendingDelete(null); del.reset(); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("superstream.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("superstream.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          {del.isError && <p role="alert" className="text-xs text-destructive">{toUserMessage(del.error)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>{t("superstream.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (pendingDelete) del.mutate(pendingDelete); }}
            >
              {t("superstream.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
