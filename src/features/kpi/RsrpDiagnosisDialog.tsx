import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { diagnoseRsrpFn } from "@/lib/ai/rsrp-diagnosis.functions";

const FIELDS = ["device", "tool", "rat", "band", "decoder", "decodeMode", "duration"] as const;

/** Technician-provided RSRP status + capture metadata, explained by an AI model. */
export function RsrpDiagnosisDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  status: Record<string, string | number | null>;
}) {
  const { t, i18n } = useTranslation();
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string>();
  const [error, setError] = useState<string>();

  const run = async () => {
    setLoading(true);
    setError(undefined);
    setAnswer(undefined);
    try {
      const metadata = Object.fromEntries(Object.entries(meta).filter(([, v]) => v.trim()));
      const res = await diagnoseRsrpFn({
        data: { lang: i18n.language?.startsWith("fr") ? "fr" : "en", status, metadata, notes },
      });
      if (res.ok) setAnswer(res.text);
      else setError(res.error);
    } catch {
      setError(t("rsrpDiagnosis.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("rsrpDiagnosis.title")}</DialogTitle>
          <DialogDescription>{t("rsrpDiagnosis.description")}</DialogDescription>
        </DialogHeader>
        <section className="space-y-1 text-xs">
          <h3 className="font-semibold">{t("rsrpDiagnosis.observed")}</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded border bg-muted/40 p-2">
            {Object.entries(status).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{t(`rsrpDiagnosis.status_${k}`)}</dt>
                <dd className="tabular-nums">{v ?? "N/D"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="grid grid-cols-2 gap-2 text-xs">
          {FIELDS.map((f) => (
            <label key={f} className="space-y-0.5">
              <span className="text-muted-foreground">{t(`rsrpDiagnosis.field_${f}`)}</span>
              <Input
                className="h-8 text-xs"
                value={meta[f] ?? ""}
                maxLength={300}
                onChange={(e) => setMeta((m) => ({ ...m, [f]: e.target.value }))}
              />
            </label>
          ))}
          <label className="col-span-2 space-y-0.5">
            <span className="text-muted-foreground">{t("rsrpDiagnosis.notes")}</span>
            <Textarea
              className="text-xs"
              rows={3}
              maxLength={2000}
              value={notes}
              placeholder={t("rsrpDiagnosis.notesPlaceholder")}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </section>
        <Button type="button" onClick={run} disabled={loading}>
          {loading ? t("rsrpDiagnosis.running") : t("rsrpDiagnosis.run")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {answer && (
          <div className="whitespace-pre-wrap rounded border p-3 text-sm leading-relaxed">{answer}</div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("rsrpDiagnosis.disclaimer")}</p>
      </DialogContent>
    </Dialog>
  );
}
