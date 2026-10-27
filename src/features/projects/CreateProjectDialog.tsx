import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toUserMessage } from "@/lib/api/http";
import { useTranslation } from "react-i18next";

export function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, visibility: "private" | "public") => void;
  busy: boolean;
  error: unknown | null;
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, busy, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Créer un projet"
        className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onCreate(trimmed, visibility);
        }}
      >
        <h3 className="text-sm font-semibold">Nouveau projet</h3>
        <p className="text-xs text-muted-foreground">
          Donnez un nom au projet. Il sera créé vide ; vous importerez ensuite des logs NMF pour le
          peupler.
        </p>
        <label className="block space-y-1">
          <span className="block text-xs font-medium">Nom du projet</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Benchmark IDF T4 2026"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            required
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">{t("projects.visibility.label")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["private", "public"] as const).map((value) => (
              <label
                key={value}
                className={`cursor-pointer rounded-md border p-3 text-xs ${visibility === value ? "border-primary bg-primary/5" : "bg-background"}`}
              >
                <input
                  type="radio"
                  name="project-visibility"
                  value={value}
                  checked={visibility === value}
                  disabled={busy}
                  onChange={() => setVisibility(value)}
                  className="mr-2"
                />
                <span className="font-medium">{t(`projects.visibility.${value}`)}</span>
                <span className="mt-1 block text-muted-foreground">
                  {t(`projects.visibility.${value}Hint`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
            <span>Création impossible : {toUserMessage(error)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Création…" : "Créer le projet"}
          </button>
        </div>
      </form>
    </div>
  );
}
