import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addProjectShare, getProjectShares, removeProjectShare } from "@/lib/api/project-shares";
import { toUserMessage } from "@/lib/api/http";

export function ProjectShareDialog({
  projectId,
  projectName,
  open,
  onClose,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const qc = useQueryClient();
  const key = ["project-shares", projectId];
  const shares = useQuery({
    queryKey: key,
    queryFn: () => getProjectShares(projectId),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: () => addProjectShare(projectId, email.trim()),
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeProjectShare(projectId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partager « {projectName} »</DialogTitle>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="utilisateur@bc4.local"
            aria-label="Adresse e-mail exacte"
          />
          <Button type="submit" disabled={add.isPending || !email.trim()}>
            <UserPlus className="mr-1 h-4 w-4" /> Ajouter
          </Button>
        </form>
        {(add.error || remove.error) && (
          <p role="alert" className="text-sm text-destructive">
            {toUserMessage(add.error ?? remove.error)}
          </p>
        )}
        <div className="divide-y rounded-md border">
          {shares.isPending ? (
            <p className="p-3 text-sm text-muted-foreground">Chargement…</p>
          ) : shares.data?.length ? (
            shares.data.map((share) => (
              <div
                key={share.user_id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{share.email}</p>
                  <p className="text-xs text-muted-foreground">{share.role}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Retirer ${share.email}`}
                  onClick={() => remove.mutate(share.user_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">Aucun partage nominatif.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
