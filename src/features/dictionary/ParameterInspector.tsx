import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ParamDetail } from "@/lib/api/dictionary-schemas";
import { fmtShare } from "./shared";

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-t py-1.5 text-[11.5px]">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function ParameterInspector({ fiche }: { fiche: ParamDetail["fiche"] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fiche.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refusé */
    }
  };
  const rule = fiche.conversion_rule;
  return (
    <section aria-label="Inspecteur de paramètre" className="p-3">
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-px text-[10px] font-bold ${fiche.techno === "LTE" ? "bg-primary text-primary-foreground" : "bg-sev-good text-primary-foreground"}`}
        >
          {fiche.techno}
        </span>
        <h2 className="truncate font-mono text-base font-bold">{fiche.leaf}</h2>
      </div>
      <dl className="mt-2">
        <Row k="Message">
          <span className="font-mono">{fiche.message}</span>
        </Row>
        <Row k="Type ASN.1">
          <span className="font-mono">{fiche.type}</span>
        </Row>
        <Row k="Chemin ASN.1">
          <span className="flex items-start gap-1.5">
            <code className="min-w-0 break-all font-mono text-[10.5px] leading-snug">
              {fiche.path}
            </code>
            <button
              onClick={copy}
              aria-label="Copier le chemin ASN.1"
              className="shrink-0 rounded p-0.5 text-primary hover:bg-muted"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </span>
        </Row>
        <Row k="Valeur observée">
          <span className="font-mono" data-testid="dominant-raw">
            {fiche.dominant.value == null ? "N/D" : String(fiche.dominant.value)}
          </span>{" "}
          <span className="text-[10px] text-muted-foreground">(brute, dominante)</span>
        </Row>
        <Row k="Valeur convertie">
          {fiche.dominant.conversion ? (
            <span className="font-mono font-semibold text-primary" data-testid="dominant-conv">
              {fiche.dominant.conversion}
            </span>
          ) : (
            <span className="text-warning-foreground" data-testid="dominant-conv">
              Index brut — conversion indisponible
            </span>
          )}
        </Row>
        <Row k="Part dominante">
          <span className="num font-mono">{fmtShare(fiche.dominant.share)}</span>
        </Row>
        <Row k="Règle de conversion">
          {rule ? (
            <span>
              <span className="font-mono" data-testid="conv-rule">
                {rule.formula}
              </span>{" "}
              <span className="text-[10px] text-muted-foreground">— {rule.ref}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Aucune règle fournie par l'API — aucune conversion supposée.
            </span>
          )}
        </Row>
      </dl>
    </section>
  );
}
