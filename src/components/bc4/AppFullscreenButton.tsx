import { useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  isAppFullscreenSupported,
  setAppFullscreen,
  useAppFullscreen,
} from "@/lib/app-fullscreen";

export function AppFullscreenButton() {
  const { t } = useTranslation();
  const active = useAppFullscreen();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const supported = isAppFullscreenSupported();

  const toggle = async () => {
    setPending(true);
    setFailed(false);
    if (!(await setAppFullscreen(!active))) setFailed(true);
    setPending(false);
  };

  const label = t(active ? "common.exitAppFullscreen" : "common.appFullscreen");
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground"
        aria-label={label}
        aria-pressed={active}
        title={t(!supported ? "common.fullscreenUnavailable" : failed ? "common.fullscreenFailed" : active ? "common.exitAppFullscreen" : "common.appFullscreen")}
        disabled={!supported || pending}
        onClick={() => void toggle()}
      >
        {active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
      </Button>
      {failed && <span role="alert" className="sr-only">{t("common.fullscreenFailed")}</span>}
    </>
  );
}
