import { useMutation } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
  renameSuperstream,
  superstreamPreconditionStatus,
  type Superstream,
} from "@/lib/api/superstreams";
import { normalizeName, validateName } from "./superstream-model";

export function SuperstreamRenameDialog({
  stream,
  projectId,
  existing,
  onClose,
  onSaved,
}: {
  stream: Superstream | null;
  projectId: string;
  existing: Superstream[];
  onClose: () => void;
  onSaved: (stream: Superstream) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setName(stream?.name ?? "");
    setTouched(false);
  }, [stream]);
  const error = stream
    ? validateName(
        name,
        existing.map((candidate) => candidate.name),
        stream.name,
      )
    : null;
  const rename = useMutation({
    mutationFn: () => renameSuperstream(projectId, stream!.id, stream!.revision, name),
    onSuccess: onSaved,
  });
  useEffect(() => {
    if (stream) rename.reset();
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps
  const precondition = superstreamPreconditionStatus(rename.error);

  return (
    <Dialog
      open={stream !== null}
      onOpenChange={(open) => {
        if (!open && !rename.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" aria-hidden />
            {t("superstream.rename")}
          </DialogTitle>
          <DialogDescription>{t("superstream.renameDescription")}</DialogDescription>
        </DialogHeader>
        <form
          id="superstream-rename-form"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!error && normalizeName(name) !== stream?.name) rename.mutate();
          }}
        >
          <label htmlFor="superstream-rename" className="text-xs font-semibold">
            {t("superstream.name")}
          </label>
          <Input
            id="superstream-rename"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
            autoFocus
          />
          {touched && error && (
            <p role="alert" className="text-xs text-destructive">
              {t(`superstream.nameError.${error}`)}
            </p>
          )}
          {rename.isError && (
            <p role="alert" className="text-xs text-destructive">
              {precondition === 409
                ? t("superstream.revisionConflict")
                : precondition === 428
                  ? t("superstream.revisionRequired")
                  : toUserMessage(rename.error)}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={rename.isPending} onClick={onClose}>
            {t("superstream.cancel")}
          </Button>
          <Button
            type="submit"
            form="superstream-rename-form"
            disabled={!!error || normalizeName(name) === stream?.name || rename.isPending}
          >
            {rename.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("superstream.rename")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
