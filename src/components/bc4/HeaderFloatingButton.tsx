import { Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { setHeaderFloating, useHeaderFloating } from "@/lib/header-floating";

/**
 * Bascule la barre du haut entre « flottante » (elle se pose sur la page et
 * ne réserve aucune place) et « ancrée » (elle reprend ses 56 px dans le
 * flux). Le choix est mémorisé et s'applique aussi bien hors qu'en plein
 * écran — en plein écran, une barre flottante se replie en plus hors champ.
 */
export function HeaderFloatingButton() {
  const { t } = useTranslation();
  const floating = useHeaderFloating();
  const label = t(floating ? "common.headerFloating" : "common.headerDocked");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0 text-muted-foreground"
      aria-label={label}
      aria-pressed={floating}
      title={`${label} — ${t("common.headerFloatingHint")}`}
      onClick={() => setHeaderFloating(!floating)}
    >
      {floating ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
    </Button>
  );
}
