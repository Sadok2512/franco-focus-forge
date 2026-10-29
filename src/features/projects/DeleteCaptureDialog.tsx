import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toUserMessage } from "@/lib/api/http";

export function DeleteCaptureDialog({
  open,
  filename,
  captureId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  filename: string;
  captureId: string;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);
  const valid = reason.trim().length >= 10;

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
            {t("projectImport.deleteCapture.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("projectImport.deleteCapture.confirm", { filename, captureId })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="delete-capture-reason">{t("projectImport.deleteCapture.reason")}</Label>
          <Textarea
            id="delete-capture-reason"
            value={reason}
            minLength={10}
            disabled={busy}
            placeholder={t("projectImport.deleteCapture.reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("projectImport.deleteCapture.reasonHelp")}
          </p>
        </div>
        {error != null && (
          <p role="alert" className="text-xs text-destructive">
            {toUserMessage(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("projectImport.deleteCapture.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !valid}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              if (valid) onConfirm(reason.trim());
            }}
          >
            {busy
              ? t("projectImport.deleteCapture.deleting")
              : t("projectImport.deleteCapture.action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
