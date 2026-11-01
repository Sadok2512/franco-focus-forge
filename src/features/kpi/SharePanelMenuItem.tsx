// Action « Copier le lien » partagée par les menus ⋮ des panneaux : le lien
// ouvre le même workspace (?tabs= + filtres) et le même projet, que l'URL ne
// porte pas par défaut.
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { buildShareUrl, copyText } from "./share-link";

export function SharePanelMenuItem({ projectId, testId }: { projectId: string; testId: string }) {
  const { t: translate } = useTranslation();
  const copy = async () => {
    const ok = await copyText(buildShareUrl(projectId));
    if (ok) toast.success(translate("panel.shareCopied"));
    else toast.error(translate("panel.shareFailed"));
  };
  return (
    <DropdownMenuItem data-testid={testId} onSelect={() => void copy()}>
      <Share2 size={14} /> {translate("panel.share")}
    </DropdownMenuItem>
  );
}
