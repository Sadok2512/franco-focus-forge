import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function AppFullscreenButton() {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSupported(Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen));
    const sync = () => setActive(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = async () => {
    setPending(true);
    setFailed(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
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