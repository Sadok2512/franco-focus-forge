import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Eye, FilePlus2, FileStack, RefreshCw, RotateCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceTemplate } from "@/lib/api/workspace-templates";
import { useWorkspaceTemplates } from "./workspace-templates-context";

function modified(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WorkspaceTemplatesMenu() {
  const { t } = useTranslation();
  const templates = useWorkspaceTemplates();
  const [pending, setPending] = useState<WorkspaceTemplate | null>(null);
  const [preview, setPreview] = useState<WorkspaceTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  if (!templates) return null;
  const save = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setCreating(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("workspaceTemplates.operationFailed"));
    } finally {
      setBusy(false);
    }
  };
  const apply = async (template: WorkspaceTemplate) => {
    try {
      await templates.apply(template);
      toast.success(t("workspaceTemplates.applied", { name: template.name }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("workspaceTemplates.applyFailed"));
    }
  };
  const requestApply = (template: WorkspaceTemplate) => {
    if (templates.workspaceDirty) setPending(template);
    else void apply(template);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="kpi-header-control"
            data-testid="workspace-templates-trigger"
          >
            <FileStack size={14} />
            <span className="truncate">
              {templates.activeTemplate?.name ?? t("workspaceTemplates.templates")}
            </span>
            <ChevronDown size={13} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>{t("workspaceTemplates.title")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="workspace-template-create"
            onSelect={() => {
              setName("");
              setDescription("");
              setCreating(true);
            }}
          >
            <FilePlus2 /> {t("workspaceTemplates.saveAs")}
          </DropdownMenuItem>
          {templates.activeTemplate && (
            <DropdownMenuItem
              disabled={!templates.workspaceDirty || busy}
              onSelect={() => void save(() => templates.update(), t("workspaceTemplates.updated"))}
            >
              <Save /> {t("workspaceTemplates.updateAction")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {templates.loading && (
            <DropdownMenuItem disabled>
              <RefreshCw className="animate-spin" /> {t("workspaceTemplates.loading")}
            </DropdownMenuItem>
          )}
          {templates.error && (
            <DropdownMenuItem onSelect={templates.retry} className="text-destructive">
              <RefreshCw /> {t("workspaceTemplates.retry")}
            </DropdownMenuItem>
          )}
          {!templates.loading && !templates.error && templates.templates.length === 0 && (
            <DropdownMenuItem disabled>{t("workspaceTemplates.none")}</DropdownMenuItem>
          )}
          {templates.templates.map((template) => (
            <DropdownMenuSub key={template.id}>
              <DropdownMenuSubTrigger data-testid={`template-${template.id}`}>
                {templates.activeTemplate?.id === template.id ? <Check /> : <FileStack />}
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">{template.name}</strong>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {template.description || t("workspaceTemplates.withoutDescription")} · {modified(template.updatedAt)}
                  </span>
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                <DropdownMenuItem onSelect={() => requestApply(template)} data-testid={`template-reload-${template.id}`}>
                  <RotateCw /> {t("workspaceTemplates.reload")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPreview(template)}>
                  <Eye /> {t("workspaceTemplates.preview")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspaceTemplates.dirtyConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspaceTemplates.dirtyConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("workspaceTemplates.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) void apply(pending);
                setPending(null);
              }}
            >
              {t("workspaceTemplates.apply")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workspaceTemplates.saveAs")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("workspaceTemplates.saveHint")}</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="template-menu-name">{t("workspaceTemplates.name")}</Label>
              <Input id="template-menu-name" value={name} maxLength={255} autoFocus onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="template-menu-description">{t("workspaceTemplates.optionalDescription")}</Label>
              <Textarea id="template-menu-description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              {t("workspaceTemplates.cancel")}
            </Button>
            <Button
              disabled={busy || !name.trim()}
              onClick={() => void save(() => templates.create(name.trim(), description.trim() || null), t("workspaceTemplates.saved"))}
            >
              {busy ? t("workspaceTemplates.saving") : t("workspaceTemplates.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg" data-testid="workspace-template-preview">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{preview.description || t("workspaceTemplates.withoutDescription")}</p>
              <dl className="grid grid-cols-2 gap-2 rounded-md border p-3">
                <dt>{t("workspaceTemplates.layout")}</dt>
                <dd>{preview.configuration.workspace.layout}</dd>
                <dt>KPI</dt>
                <dd>{preview.configuration.workspace.kpiCodes.length}</dd>
                <dt>{t("workspaceTemplates.metrics")}</dt>
                <dd>{preview.configuration.workspace.metricCodes.length}</dd>
                <dt>{t("workspaceTemplates.panels")}</dt>
                <dd>{preview.configuration.workspace.panelLayout.order.length}</dd>
                <dt>{t("workspaceTemplates.modified")}</dt>
                <dd>{modified(preview.updatedAt)}</dd>
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
