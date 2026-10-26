// Fiche capture (back endpoint GET /projects/{pid}/captures/{cap}/sheet).
// 1.109.0 — Lot B front. Panneau latéral `Sheet` avec sections : Fichier,
// Décodage, Script, Device, Trafic, Identité. Pas d'identifiant abonné
// (bloc Identité = ligne unique "masquée (privacy)"). Valeurs absentes
// grisées. Zéro valeur en dur côté client.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api/http";

type CaptureSheetData = {
  project_id: string;
  capture_id: string;
  nmf_file: {
    filename: string;
    size_bytes: number | null;
    sha256: string | null;
    uploaded_at: string | null;
  };
  decode: {
    level: string | null;
    decoder_version: string | null;
    schema_version: string | null;
    format_version: string | null;
    decoded_at: string | null;
    deep_decoded_at: string | null;
    n_records: number | null;
    n_partial: number | null;
    elapsed_s: number | null;
    kind: string | null;
  };
  script: {
    file: string | null;
    version: string | null;
    cmd_1: string | null;
    cmd_2: string | null;
    cmd_3: string | null;
  } | null;
  devi: {
    batt_min: number | null;
    batt_max: number | null;
    temp_min: number | null;
    temp_max: number | null;
    volt_min: number | null;
    volt_max: number | null;
    n: number;
  } | null;
  traffic: Record<string, { n: number; seq_first: number; seq_last: number }>;
  identity: { present: boolean; reason: string; masked_events: string[] };
  missing_fields: Array<{ field: string; reason: string }>;
};

// Schema permissif : les champs back qui pourraient être null ou optionnels
// sont tous reflétés via `.nullable()` + `.optional()`. Jamais de valeur
// par défaut côté front — "—" grisé si absent.
const CaptureSheetSchema = z.object({
  project_id: z.string(),
  capture_id: z.string(),
  nmf_file: z.object({
    filename: z.string(),
    size_bytes: z.number().nullable().optional(),
    sha256: z.string().nullable().optional(),
    uploaded_at: z.string().nullable().optional(),
  }),
  decode: z.object({
    level: z.string().nullable().optional(),
    decoder_version: z.string().nullable().optional(),
    schema_version: z.string().nullable().optional(),
    format_version: z.string().nullable().optional(),
    decoded_at: z.string().nullable().optional(),
    deep_decoded_at: z.string().nullable().optional(),
    n_records: z.number().nullable().optional(),
    n_partial: z.number().nullable().optional(),
    elapsed_s: z.number().nullable().optional(),
    kind: z.string().nullable().optional(),
  }),
  script: z
    .object({
      file: z.string().nullable().optional(),
      version: z.string().nullable().optional(),
      cmd_1: z.string().nullable().optional(),
      cmd_2: z.string().nullable().optional(),
      cmd_3: z.string().nullable().optional(),
    })
    .nullable(),
  devi: z
    .object({
      batt_min: z.number().nullable().optional(),
      batt_max: z.number().nullable().optional(),
      temp_min: z.number().nullable().optional(),
      temp_max: z.number().nullable().optional(),
      volt_min: z.number().nullable().optional(),
      volt_max: z.number().nullable().optional(),
      n: z.number(),
    })
    .nullable(),
  traffic: z.record(
    z.object({ n: z.number(), seq_first: z.number(), seq_last: z.number() }).passthrough(),
  ),
  identity: z.object({
    present: z.boolean(),
    reason: z.string(),
    masked_events: z.array(z.string()),
  }),
  missing_fields: z.array(z.object({ field: z.string(), reason: z.string() })),
});

async function fetchCaptureSheet(
  projectId: string,
  captureId: string,
  signal?: AbortSignal,
): Promise<CaptureSheetData> {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/captures/${encodeURIComponent(captureId)}/sheet`,
    CaptureSheetSchema,
    signal != null ? { signal } : {},
  ) as Promise<CaptureSheetData>;
}

function mb(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function na(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function Row({ label, value, grey }: { label: string; value: string; grey?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-border/40 last:border-b-0">
      <div className="w-44 shrink-0 text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`flex-1 text-xs font-mono break-all ${
          grey || value === "—" ? "text-muted-foreground opacity-60" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-semibold text-foreground mb-2 pb-1 border-b-2 border-primary/40">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function CaptureSheet({
  projectId,
  captureId,
  open,
  onOpenChange,
}: {
  projectId: string;
  captureId: string | undefined;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["capture-sheet", projectId, captureId],
    queryFn: ({ signal }) => fetchCaptureSheet(projectId, captureId!, signal),
    enabled: !!captureId && open,
    staleTime: 60_000,
  });
  const d = query.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Fiche capture · {captureId ?? "—"}</SheetTitle>
          <SheetDescription>
            Metadata, SCRIPT, DEVI, DAA/DREQ/DCOMP. Aucun identifiant abonné (privacy).
          </SheetDescription>
        </SheetHeader>

        {query.isLoading && (
          <div className="py-10 text-sm text-muted-foreground">Chargement…</div>
        )}
        {query.isError && (
          <div className="py-10 text-sm text-destructive">
            Impossible de charger la fiche : {String(query.error)}
          </div>
        )}

        {d && (
          <div className="mt-4">
            <Section title="Fichier">
              <Row label="Nom" value={na(d.nmf_file.filename)} />
              <Row label="Taille" value={mb(d.nmf_file.size_bytes)} />
              <Row
                label="SHA-256"
                value={d.nmf_file.sha256 ? `${d.nmf_file.sha256.slice(0, 16)}…` : "—"}
              />
              <Row
                label="FF version"
                value={na(d.decode.format_version)}
              />
              <Row
                label="Uploadé"
                value={d.nmf_file.uploaded_at ? d.nmf_file.uploaded_at.slice(0, 19) : "—"}
              />
            </Section>

            <Section title="Décodage">
              <Row label="Niveau" value={na(d.decode.level)} />
              <Row label="decoder_version" value={na(d.decode.decoder_version)} />
              <Row
                label="n_records"
                value={d.decode.n_records != null ? d.decode.n_records.toLocaleString() : "—"}
              />
              <Row
                label="n_partial"
                value={d.decode.n_partial != null ? d.decode.n_partial.toLocaleString() : "—"}
              />
              <Row
                label="n_range_viol"
                value="voir table range_violations"
                grey
              />
              <Row
                label="Décodé"
                value={d.decode.decoded_at ? d.decode.decoded_at.slice(0, 19) : "—"}
              />
              <Row label="Kind" value={na(d.decode.kind)} />
            </Section>

            <Section title="Script (SCRIPT event)">
              {d.script ? (
                <>
                  <Row label="Fichier" value={na(d.script.file)} />
                  <Row label="Version" value={na(d.script.version)} />
                  <Row label="Commande 1" value={na(d.script.cmd_1)} />
                  <Row label="Commande 2" value={na(d.script.cmd_2)} />
                  <Row label="Commande 3" value={na(d.script.cmd_3)} />
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-2">— aucun event SCRIPT</div>
              )}
            </Section>

            <Section title="Device (DEVI agrégé)">
              {d.devi && d.devi.n > 0 ? (
                <>
                  <Row
                    label="Batterie %"
                    value={
                      d.devi.batt_min != null && d.devi.batt_max != null
                        ? `${d.devi.batt_min.toFixed(1)} .. ${d.devi.batt_max.toFixed(1)}`
                        : "—"
                    }
                  />
                  <Row
                    label="Température °C"
                    value={
                      d.devi.temp_min != null && d.devi.temp_max != null
                        ? `${d.devi.temp_min.toFixed(1)} .. ${d.devi.temp_max.toFixed(1)}`
                        : "—"
                    }
                  />
                  <Row
                    label="Voltage V"
                    value={
                      d.devi.volt_min != null && d.devi.volt_max != null
                        ? `${d.devi.volt_min.toFixed(3)} .. ${d.devi.volt_max.toFixed(3)}`
                        : "—"
                    }
                  />
                  <Row label="n events" value={d.devi.n.toLocaleString()} />
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-2">— aucun event DEVI</div>
              )}
            </Section>

            <Section title="Trafic (DAA / DREQ / DCOMP)">
              {(["DAA", "DREQ", "DCOMP"] as const).map((ev) => {
                const t = d.traffic?.[ev];
                return (
                  <Row
                    key={ev}
                    label={ev}
                    value={t ? `n=${t.n}, seq ${t.seq_first}→${t.seq_last}` : "—"}
                  />
                );
              })}
            </Section>

            <Section title="Identité abonné">
              <div className="text-xs text-muted-foreground py-2 font-mono">
                masquée (privacy)
              </div>
            </Section>

            {d.missing_fields.length > 0 && (
              <Section title="Champs absents">
                {d.missing_fields.map((m) => (
                  <Row key={m.field} label={m.field} value={m.reason} grey />
                ))}
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
