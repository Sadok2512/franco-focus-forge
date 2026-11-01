import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus2, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ApiHttpError } from "@/lib/api/http";
import { useWorkspaceTemplates } from "./workspace-templates-context";

function mutationMessage(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiHttpError && error.status === 409) {
    return t("workspaceTemplates.revisionConflict");
  }
  if (error instanceof ApiHttpError && error.status === 428) {
    return t("workspaceTemplates.preconditionRequired");
  }
  return error instanceof Error ? error.message : t("workspaceTemplates.operationFailed");
}

export function WorkspaceTemplateSettings() {
  const { t } = useTranslation();
  const templates = useWorkspaceTemplates();
  const [editor, setEditor] = useState<"create" | "rename" | null>(null);
  const [confirm, setConfirm] = useState<"update" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (editor === "rename") setName(templates?.activeTemplate?.name ?? "");
    if (editor === "create") {
      setName("");
      setDescription("");
    }
  }, [editor, templates?.activeTemplate?.name]);
  if (!templates) return null;

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setEditor(null);
      setConfirm(null);
    } catch (error) {
      toast.error(mutationMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t pt-4" data-testid="workspace-template-settings">
      <div>
        <h4 className="text-xs font-semibold">{t("workspaceTemplates.singular")}</h4>
        <p className="text-[11px] text-muted-foreground">
          {templates.activeTemplate
            ? t("workspaceTemplates.activeRevision", { name: templates.activeTemplate.name, revision: templates.activeTemplate.revision })
            : t("workspaceTemplates.noActive")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditor("create")}>
          <FilePlus2 /> {t("workspaceTemplates.saveAs")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!templates.activeTemplate || !templates.workspaceDirty}
          onClick={() => setConfirm("update")}
        >
          <Save /> {t("workspaceTemplates.updateAction")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!templates.activeTemplate}
          onClick={() => setEditor("rename")}
        >
          <Pencil /> {t("workspaceTemplates.renameAction")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!templates.activeTemplate}
          onClick={() => setConfirm("delete")}
        >
          <Trash2 /> {t("workspaceTemplates.deleteAction")}
        </Button>
        {templates.error && (
          <Button size="sm" variant="ghost" onClick={templates.retry}>
            <RefreshCw /> {t("workspaceTemplates.retry")}
          </Button>
        )}
      </div>

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editor === "create" ? t("workspaceTemplates.saveAs") : t("workspaceTemplates.renameTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="workspace-template-name">{t("workspaceTemplates.name")}</Label>
              <Input
                id="workspace-template-name"
                value={name}
                maxLength={255}
                required
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {editor === "create" && (
              <div className="space-y-1">
                <Label htmlFor="workspace-template-description">{t("workspaceTemplates.optionalDescription")}</Label>
                <Textarea
                  id="workspace-template-description"
                  value={description}
                  maxLength={2000}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={busy}>
              {t("workspaceTemplates.cancel")}
            </Button>
            <Button
              disabled={busy || !name.trim()}
              onClick={() =>
                void run(
                  () =>
                    editor === "create"
                      ? templates.create(name.trim(), description.trim() || null)
                      : templates.rename(name.trim()),
                  editor === "create" ? t("workspaceTemplates.saved") : t("workspaceTemplates.renamed"),
                )
              }
            >
              {busy ? t("workspaceTemplates.saving") : t("workspaceTemplates.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "update" ? t("workspaceTemplates.updateConfirmTitle") : t("workspaceTemplates.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "update"
                ? t("workspaceTemplates.updateConfirmDescription")
                : t("workspaceTemplates.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("workspaceTemplates.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void run(
                  () => (confirm === "update" ? templates.update() : templates.remove()),
                  confirm === "update" ? t("workspaceTemplates.updated") : t("workspaceTemplates.deleted"),
                );
              }}
            >
              {t("workspaceTemplates.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
