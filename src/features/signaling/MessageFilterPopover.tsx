import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, MailCheck, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { searchMessageTypes, setVisibleTypes, type MessageSelection, type MessageType } from "./message-filter";

const badgeKinds: Record<string, string> = { "RRC LTE": "lte", "RRC NR": "nr", NAS: "nas", "Événements Nemo": "nemo", "MAC-RACH": "mac" };
export function MessageLayerBadge({ protocol }: { protocol: string }) {
  const { t } = useTranslation();
  const kind = badgeKinds[protocol];
  return <span className={`sig-layer-badge ${kind ? `sig-layer-${kind}` : ""}`}>{kind ? t(`sigFilters.badge.${kind}`) : protocol}</span>;
}

export function MessageFilterPopover({ types, selection, onApply, onRequest, loading, error, disabled = false }: {
  types: MessageType[]; selection: MessageSelection; onApply: (selection: MessageSelection) => void;
  onRequest: () => void; loading: boolean; error: boolean; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<MessageSelection>(selection);
  const visible = useMemo(() => searchMessageTypes(types, query), [types, query]);
  const chosen = draft ?? types.map((type) => type.key);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const changeOpen = (next: boolean) => {
    if (next) { setDraft(selection); setQuery(""); onRequest(); }
    setOpen(next);
  };
  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="sig-message-trigger" disabled={disabled} data-testid="message-filter-trigger">
        <MailCheck aria-hidden="true" />
        <span>{selection === null ? t("sigFilters.allMessages") : t("sigFilters.selected", { count: selection.length })}</span>
        <ChevronDown aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent side="right" align="start" sideOffset={16} collisionPadding={12} className="sig-message-popover" aria-label={t("sigFilters.popupTitle")} data-testid="message-filter-popover">
      <header className="sig-message-header">
        <span className="sig-filter-icon"><MailCheck size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h3>{t("sigFilters.popupTitle")}</h3><p>{t("sigFilters.popupSubtitle")}</p></div>
        <Button variant="ghost" size="icon" aria-label={t("sigFilters.close")} onClick={() => changeOpen(false)}><X /></Button>
      </header>
      <div className="sig-message-actions">
        <label className="sig-search"><Search size={14} /><input aria-label={t("sigFilters.popupSearch")} placeholder={t("sigFilters.popupSearch")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <Button variant="outline" size="sm" disabled={loading || error} onClick={() => setDraft(setVisibleTypes(chosen, visible, true))}>{t("sigFilters.all")}</Button>
        <Button variant="outline" size="sm" disabled={loading || error} onClick={() => setDraft(setVisibleTypes(chosen, visible, false))}>{t("sigFilters.none")}</Button>
      </div>
      <p className="sig-message-scope">{t("sigFilters.scope")}</p>
      <div className="sig-message-options" data-testid="message-filter-options">
        {loading ? <p role="status" className="p-4">{t("sigFilters.loading")}</p> : error ? <div role="alert" className="p-4"><p>{t("sigFilters.error")}</p><Button variant="outline" size="sm" onClick={onRequest}>{t("common.retry")}</Button></div> : visible.length === 0 ? <p role="status" className="p-4">{t("sigFilters.noTypes")}</p> : visible.map((type) => <label key={type.key} className="sig-message-option">
          <Checkbox aria-label={type.name + " · " + type.protocol} checked={chosenSet.has(type.key)} onCheckedChange={(checked) => setDraft(setVisibleTypes(chosen, [type], checked === true))} />
          <MessageLayerBadge protocol={type.protocol} />
          <span className="sig-message-name" title={type.name}>{type.name}</span>
          <span className="sig-occurrence" title={t("sigFilters.occurrences", { count: type.count })}>{type.count.toLocaleString()}</span>
        </label>)}
      </div>
      <footer className="sig-message-footer">
        <span>{t("sigFilters.selected", { count: chosen.length })}</span>
        <Button variant="outline" size="sm" onClick={() => changeOpen(false)}>{t("sigFilters.cancel")}</Button>
        <Button size="sm" disabled={loading || error} onClick={() => { onApply(draft); setOpen(false); }}>{t("sigFilters.apply")}</Button>
      </footer>
    </PopoverContent>
  </Popover>;
}