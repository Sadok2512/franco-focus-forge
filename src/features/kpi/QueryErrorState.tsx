import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toUserMessage } from "@/lib/api/http";

export function QueryErrorState({
  error,
  title,
  onRetry,
}: {
  error: unknown;
  title: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="kpi-chart-state" role="alert" data-testid="kpi-query-error">
      <strong>{title}</strong>
      <p>{toUserMessage(error)}</p>
      <button type="button" className="kpi-button" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden /> {t("kpi.af273d956b5b")}
      </button>
    </div>
  );
}
