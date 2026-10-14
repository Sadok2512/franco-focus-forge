import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingSkeleton({ className = "h-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-busy="true" aria-label="Chargement" />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="font-medium">Données indisponibles</p>
      <p className="text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs hover:bg-muted">
          <RotateCw className="h-3 w-3" /> Réessayer
        </button>
      )}
    </div>
  );
}

export function PartialWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-warning px-2.5 py-1.5 text-xs text-warning-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{children}</span>
    </div>
  );
}

export function DemoBadge() {
  return <span className="rounded-sm border border-dashed border-warning-foreground/40 bg-warning px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning-foreground">Données démo</span>;
}
