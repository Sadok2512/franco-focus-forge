import { AlertTriangle, CheckCircle2, Loader2, Lock, Unplug } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getActor } from "@/lib/auth";
import type { Actor } from "@/lib/api/settings-schemas";

/** 1.19.0 — Bandeau "NON CONNECTÉ AU BACK" (rouge). À placer en tête de
 *  tout panel qui lit encore des fixtures. L'écran ne doit JAMAIS
 *  ressembler à du réel sans source back. */
export function NotWiredBanner({
  what,
  why,
}: {
  what: string;
  why: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive"
    >
      <Unplug className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold uppercase tracking-wider">
          NON CONNECTÉ AU BACK — {what}
        </p>
        <p className="mt-0.5 text-destructive/90">{why}</p>
      </div>
    </div>
  );
}

export const errMsg = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Erreur inconnue";
export const errField = (e: unknown) =>
  e && typeof e === "object" && "field" in e ? String((e as { field: unknown }).field) : null;
export const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Current (demo) actor; re-renders when the demo role changes. */
export function useActor(): Actor {
  const [a, setA] = useState<Actor>(getActor);
  useEffect(() => {
    const f = () => setA(getActor());
    window.addEventListener("bc4-role", f);
    return () => window.removeEventListener("bc4-role", f);
  }, []);
  return a;
}

export type FormStatus = "pristine" | "dirty" | "saving" | "saved" | "failed";
/** Draft vs persisted state: a form value is never proof of saving. */
export function useFormState<T>(persisted: T | undefined) {
  const [draft, setDraftRaw] = useState<T | undefined>(persisted);
  const [status, setStatus] = useState<FormStatus>("pristine");
  const [error, setError] = useState<{ message: string; field: string | null } | null>(null);
  const key = JSON.stringify(persisted ?? null);
  useEffect(() => {
    if (persisted !== undefined && (status === "pristine" || status === "saved"))
      setDraftRaw(persisted);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const setDraft = useCallback((patch: Partial<T>) => {
    setDraftRaw((d) => ({ ...(d as T), ...patch }));
    setStatus("dirty");
    setError(null);
  }, []);
  const save = async (fn: (d: T) => Promise<unknown>) => {
    if (draft === undefined) return;
    setStatus("saving");
    setError(null);
    try {
      await fn(draft);
      setStatus("saved");
    } catch (e) {
      setStatus("failed");
      setError({ message: errMsg(e), field: errField(e) });
    }
  };
  const reset = () => {
    setDraftRaw(persisted);
    setStatus("pristine");
    setError(null);
  };
  return { draft, setDraft, status, error, save, reset };
}

export function SaveStatus({
  status,
  error,
}: {
  status: FormStatus;
  error?: { message: string } | null;
}) {
  const map: Record<FormStatus, ReactNode> = {
    pristine: <span className="text-muted-foreground">Aucune modification</span>,
    dirty: (
      <span className="text-warning-foreground">Modifications non enregistrées (aperçu local)</span>
    ),
    saving: (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Enregistrement…
      </span>
    ),
    saved: (
      <span className="inline-flex items-center gap-1 text-sev-good">
        <CheckCircle2 className="h-3 w-3" />
        Enregistré
      </span>
    ),
    failed: (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Échec : {error?.message}
      </span>
    ),
  };
  return (
    <p role="status" aria-live="polite" className="text-xs">
      {map[status]}
    </p>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold">{title}</h3>}
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  "h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const btn =
  "inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
export const btnPrimary =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export function ReadOnlyNotice({
  children = "Lecture seule : votre rôle ne permet pas de modifier ces réglages.",
}: {
  children?: ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 rounded-md border border-dashed bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Lock className="h-3.5 w-3.5" aria-hidden /> {children}
    </p>
  );
}

export function Forbidden() {
  return (
    <div
      role="alert"
      className="flex min-h-[30vh] flex-col items-center justify-center gap-2 rounded-lg border bg-card text-center"
    >
      <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">Accès réservé</p>
      <p className="text-xs text-muted-foreground">
        Votre rôle ne donne pas accès à cette section.
      </p>
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "good" | "bad" | "primary" | "warn";
}) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    good: "bg-sev-good/15 text-sev-good",
    bad: "bg-destructive/10 text-destructive",
    primary: "bg-accent text-accent-foreground",
    warn: "bg-warning text-warning-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border bg-card p-5 shadow-xl"
      >
        <h3 className="mb-4 text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type }));
  a.download = name;
  a.click();
}
