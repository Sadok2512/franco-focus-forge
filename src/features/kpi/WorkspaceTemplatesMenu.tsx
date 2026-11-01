import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Eye, FileStack, RefreshCw } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  if (!templates) return null;
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
                <DropdownMenuItem onSelect={() => requestApply(template)}>
                  <Check /> {t("workspaceTemplates.apply")}
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
