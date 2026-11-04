import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { openAuthenticatedTab } from "@/lib/api/http";
import { fullAppTabUrl } from "@/lib/app-tabs";

export function AppNewTabButton() {
  const { t } = useTranslation();
  const label = t("common.openAppTab");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0 text-muted-foreground"
      aria-label={label}
      title={label}
      onClick={() => openAuthenticatedTab(fullAppTabUrl(window.location.href))}
    >
      <ExternalLink aria-hidden="true" />
    </Button>
  );
}
