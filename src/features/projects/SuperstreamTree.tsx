import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  Layers,
  ListRestart,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
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
import {
  clearSuperstreamsLocalStorageMock,
  deleteSuperstream,
  getProjectLogs,
  listSuperstreams,
  superstreamPreconditionStatus,
  type Superstream,
} from "@/lib/api/superstreams";
import { SuperstreamDialog } from "./SuperstreamDialog";
import { SuperstreamRenameDialog } from "./SuperstreamRenameDialog";

const EXP_KEY = "bc4.superstreams.expanded";
function readExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(EXP_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export const superstreamsKey = (projectId: string) =>
  ["project", projectId, "superstreams"] as const;

export function SuperstreamTree({
  projectId,
  projectName,
  highlightId,
  canWrite = false,
}: {
  projectId: string;
  projectName: string;
  highlightId?: string | null;
  canWrite?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: superstreamsKey(projectId),
    queryFn: ({ signal }) => listSuperstreams(projectId, signal),
  });
  const logsQ = useQuery({
    queryKey: ["project", projectId, "superstream-logs"],
    queryFn: ({ signal }) => getProjectLogs(projectId, signal),
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => setExpanded(readExpanded()), []);
  // NMFHE2 — purge les clés `bc4.superstreams.<pid>` écrites par la version
  // simulée (localStorage mock) : le back est désormais la seule source.
  useEffect(() => {
    clearSuperstreamsLocalStorageMock();
  }, []);
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
  }, [highlightId, projectId]);

  const [editingMembers, setEditingMembers] = useState<Superstream | null>(null);
  const [renaming, setRenaming] = useState<Superstream | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Superstream | null>(null);
  const del = useMutation({
    mutationFn: (s: Superstream) => deleteSuperstream(projectId, s.id, s.revision),
    onSuccess: () => {
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: superstreamsKey(projectId) });
      toast.success(t("superstream.deleted"));
    },
  });

  const list = listQ.data ?? [];
  const logs = logsQ.data ?? [];
  const streamsKey = `${projectId}:streams`;
  const logsKey = `${projectId}:logs`;
  const Chevron = ({ open }: { open: boolean }) =>
    open ? (
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    );
  const Badge = ({ n }: { n: number }) => (
    <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
      {n}
    </span>
  );

  return (
    <div className="rounded-md border bg-background p-3 text-xs" data-testid="superstream-tree">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Folder className="h-3.5 w-3.5 text-primary" aria-hidden /> {projectName}
      </p>
      <ul role="tree" className="ml-2 space-y-0.5 border-l pl-2">
        <li role="treeitem" aria-expanded={expanded.has(streamsKey)}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted"
            onClick={() => toggle(streamsKey)}
          >
            <Chevron open={expanded.has(streamsKey)} />
            <Layers className="h-3.5 w-3.5 text-primary" aria-hidden /> {t("superstream.branch")}{" "}
            <Badge n={list.length} />
          </button>
          {expanded.has(streamsKey) && (
            <ul role="group" className="ml-3 space-y-0.5 border-l pl-2">
              {listQ.isPending && (
                <li className="text-muted-foreground">{t("superstream.loading")}</li>
              )}
              {listQ.isError && (
                <li className="text-destructive" role="alert">
                  {toUserMessage(listQ.error)}
                </li>
              )}
              {listQ.isSuccess && list.length === 0 && (
                <li className="px-1 text-muted-foreground">{t("superstream.empty")}</li>
              )}
              {list.map((s) => {
                const key = `${projectId}:ss:${s.id}`;
                const open = expanded.has(key);
                return (
                  <li key={s.id} role="treeitem" aria-expanded={open} data-superstream={s.name}>
                    <div
                      className={`group flex items-center gap-1 rounded ${s.id === highlightId ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}
                    >
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-1.5 px-1 py-0.5 text-left hover:bg-muted"
                        onClick={() => toggle(key)}
                      >
                        <Chevron open={open} />
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{s.name}</span>{" "}
                        <Badge n={s.captureIds.length} />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("superstream.actionsFor", { name: s.name })}
                            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                          >
                            <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => toggle(key, true)}>
                            <Eye className="h-4 w-4" aria-hidden /> {t("superstream.open")}
                          </DropdownMenuItem>
                          {canWrite && (
                            <>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setTimeout(() => setRenaming(s), 0);
                                }}
                              >
                                <Pencil className="h-4 w-4" aria-hidden /> {t("superstream.rename")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setTimeout(() => setEditingMembers(s), 0);
                                }}
                              >
                                <ListRestart className="h-4 w-4" aria-hidden />{" "}
                                {t("superstream.editMembers")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                onSelect={() => {
                                  setTimeout(() => setPendingDelete(s), 0);
                                }}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden /> {t("superstream.delete")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {open && (
                      <ul role="group" className="ml-5 border-l pl-2">
                        {s.members.map((member) => (
                          <li
                            key={member.captureId}
                            role="treeitem"
                            className="flex items-center gap-1.5 py-0.5 text-muted-foreground"
                          >
                            <FileText className="h-3 w-3" aria-hidden />
                            <span className="w-5 text-right font-mono text-[10px]">
                              {member.position + 1}.
                            </span>
                            <span
                              className="truncate"
                              title={`${member.captureName} · ${member.captureId}`}
                            >
                              {member.captureName}
                            </span>
                            <span
                              className="truncate font-mono text-[10px]"
                              title={member.captureId}
                            >
                              {member.captureId}
                            </span>
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
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted"
            onClick={() => toggle(logsKey)}
          >
            <Chevron open={expanded.has(logsKey)} />
            <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{" "}
            {t("superstream.logsBranch")} <Badge n={logs.length} />
          </button>
          {expanded.has(logsKey) && (
            <ul role="group" className="ml-5 border-l pl-2">
              {logs.map((l) => (
                <li
                  key={l.id}
                  role="treeitem"
                  className="flex items-center gap-1.5 py-0.5 text-muted-foreground"
                >
                  <FileText className="h-3 w-3" aria-hidden />
                  <span className="truncate font-mono" title={l.filename}>
                    {l.filename}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>

      <SuperstreamDialog
        open={editingMembers !== null}
        projectId={projectId}
        projectName={projectName}
        existing={list}
        editing={editingMembers}
        mode="members"
        onClose={() => setEditingMembers(null)}
        onSaved={() => {
          setEditingMembers(null);
          void qc.invalidateQueries({ queryKey: superstreamsKey(projectId) });
          toast.success(t("superstream.saved"));
        }}
      />
      <SuperstreamRenameDialog
        stream={renaming}
        projectId={projectId}
        existing={list}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          void qc.invalidateQueries({ queryKey: superstreamsKey(projectId) });
          toast.success(t("superstream.renamed"));
        }}
      />
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o && !del.isPending) {
            setPendingDelete(null);
            del.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("superstream.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("superstream.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          {del.isError && (
            <p role="alert" className="text-xs text-destructive">
              {superstreamPreconditionStatus(del.error) === 409
                ? t("superstream.revisionConflict")
                : superstreamPreconditionStatus(del.error) === 428
                  ? t("superstream.revisionRequired")
                  : toUserMessage(del.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>
              {t("superstream.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete);
              }}
            >
              {t("superstream.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
