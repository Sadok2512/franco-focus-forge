import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProcedures, type ProcedureRow } from "@/lib/api/client";

const PAGE_SIZE = 100;

function value(value: string | number | null): string {
  return value == null || value === "" ? "—" : String(value);
}

export function ProcedureExplorer({
  projectId,
  captureIds,
  name,
  procedureTypes,
  open,
  onOpenChange,
  onOpenSignaling,
}: {
  projectId: string;
  captureIds: string[];
  name: string;
  procedureTypes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSignaling: (row: ProcedureRow) => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["procedures", projectId, captureIds, procedureTypes, page, PAGE_SIZE],
    queryFn: ({ signal }) =>
      getProcedures(projectId, captureIds, procedureTypes, page, PAGE_SIZE, signal),
    enabled: open && captureIds.length > 0 && procedureTypes.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1400px)] max-w-none overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("procedures.title", { name })}</DialogTitle>
          <DialogDescription>
            {t("procedures.description", { count: query.data?.total ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p className="p-6 text-sm" role="status">
            {t("procedures.loading")}
          </p>
        ) : query.isError ? (
          <div className="p-6 text-sm" role="alert">
            <p>{query.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RefreshCw size={14} /> {t("procedures.retry")}
            </Button>
          </div>
        ) : (
          <div className="min-h-0 overflow-auto rounded border">
            <table className="w-full min-w-[1180px] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left">
                <tr>
                  {["time", "ue", "procedure", "result", "cause", "source", "target", "bearer", "evidence", "proof"].map(
                    (key) => (
                      <th key={key} className="px-2 py-2 font-semibold">
                        {t(`procedures.columns.${key}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {(query.data?.rows ?? []).map((row) => (
                  <tr key={row.procedure_id} className="border-t align-top hover:bg-muted/40">
                    <td className="whitespace-nowrap px-2 py-2">
                      {value(row.start_time)}
                      <span className="block text-muted-foreground">
                        {row.capture_id} · seq {row.start_seq}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono">{row.ue_key}</td>
                    <td className="px-2 py-2">{row.procedure_type}</td>
                    <td className="px-2 py-2 font-semibold">{row.result}</td>
                    <td className="px-2 py-2">{value(row.failure_cause)}</td>
                    <td className="px-2 py-2">
                      PCI {value(row.source_pci)}
                      <span className="block">ARFCN {value(row.source_arfcn)}</span>
                    </td>
                    <td className="px-2 py-2">
                      PCI {value(row.target_pci)}
                      <span className="block">ARFCN {value(row.target_arfcn)}</span>
                    </td>
                    <td className="px-2 py-2">
                      EBI {value(row.ebi)} · QCI {value(row.qci)}
                      <span className="block">
                        QFI {value(row.qfi)} · 5QI {value(row.five_qi)}
                      </span>
                      <span className="block">S-NSSAI {value(row.s_nssai)}</span>
                    </td>
                    <td className="px-2 py-2">{row.evidence_level}</td>
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={row.source_event_ids.join("\n")}
                        onClick={() => onOpenSignaling(row)}
                      >
                        <ExternalLink size={14} /> {row.source_event_ids.length}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!query.data?.rows.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t("procedures.empty")}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <span>
            {t("procedures.page", { page, pages: query.data?.pages ?? 0 })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("procedures.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!query.data || page >= query.data.pages}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("procedures.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
