import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ALL_MESSAGE_FILTERS,
  messageCategoryCounts,
  messagePreset,
  selectionForMessageFilter,
  type MessageCategoryId,
  type MessageFilterState,
  type MessageType,
} from "./message-filter";

const badgeKinds: Record<string, string> = {
  "RRC LTE": "lte",
  "RRC NR": "nr",
  NAS: "nas",
  "Événements Nemo": "nemo",
  "MAC-RACH": "mac",
};
export function MessageLayerBadge({ protocol }: { protocol: string }) {
  const { t } = useTranslation();
  const kind = badgeKinds[protocol];
  return (
    <span className={`sig-layer-badge ${kind ? `sig-layer-${kind}` : ""}`}>
      {kind ? t(`sigFilters.badge.${kind}`) : protocol}
    </span>
  );
}

const CATEGORY_IDS: MessageCategoryId[] = [
  "BCCH",
  "PAGING",
  "DL_CCCH",
  "UL_CCCH",
  "DL_DCCH",
  "UL_DCCH",
  "NAS_LTE",
  "NAS_5G",
  "RRC_LTE",
  "RRC_NR",
  "S1AP",
  "NGAP",
  "X2AP",
  "XNAP",
  "IMS_SIP",
  "OTHER",
];
const PRESETS = [
  "all",
  "rrc",
  "nas",
  "rrc_nas",
  "control",
  "paging",
  "mobility",
  "call",
  "failures",
];

export function MessageFilterPopover({
  types,
  filter,
  onApply,
  onRequest,
  loading,
  error,
  disabled = false,
  open,
  onOpenChange,
}: {
  types: MessageType[];
  filter: MessageFilterState;
  onApply: (filter: MessageFilterState) => void;
  onRequest: () => void;
  loading: boolean;
  error: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const activeOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<MessageFilterState>(filter);
  useEffect(() => {
    if (activeOpen) setDraft(filter);
  }, [activeOpen, filter]);
  const counts = useMemo(() => messageCategoryCounts(types), [types]);
  const names = useMemo(() => {
    const byName = new Map<string, number>();
    for (const type of types) byName.set(type.name, (byName.get(type.name) ?? 0) + type.count);
    return [...byName.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [types]);
  const visibleNames = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? names.filter(([name]) => name.toLocaleLowerCase().includes(q)) : names;
  }, [names, query]);
  const selectedKeys = selectionForMessageFilter(types, draft);
  const selectedCount = selectedKeys === null ? types.length : selectedKeys.length;
  const toggleCategory = (id: MessageCategoryId, checked: boolean) => {
    const current =
      draft.categories === null
        ? CATEGORY_IDS.filter((item) => (counts.get(item) ?? 0) > 0)
        : draft.categories;
    const categories = checked
      ? [...new Set([...current, id])]
      : current.filter((item) => item !== id);
    setDraft({ ...draft, categories, preset: null });
  };
  const toggleName = (name: string, checked: boolean) => {
    const current = draft.names === null ? names.map(([item]) => item) : draft.names;
    const nextNames = checked
      ? [...new Set([...current, name])]
      : current.filter((item) => item !== name);
    setDraft({ ...draft, names: nextNames, preset: null });
  };
  const changeOpen = (next: boolean) => {
    if (next) {
      setQuery("");
      onRequest();
    }
    setOpen(next);
  };
  return (
    <Popover open={activeOpen} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="sig-message-trigger"
          disabled={disabled}
          data-testid="message-filter-trigger"
        >
          <ListFilter aria-hidden="true" />
          <span>{t("sigFilters.messageFilter")}</span>
          <span className="sig-filter-count">{selectedCount}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="sig-message-popover"
        aria-label={t("sigFilters.popupTitle")}
        data-testid="message-filter-popover"
      >
        <header className="sig-message-header">
          <ListFilter size={18} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3>{t("sigFilters.popupTitle")}</h3>
            <p>{t("sigFilters.popupSubtitle")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("sigFilters.close")}
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </header>
        {loading ? (
          <p role="status" className="p-4">
            {t("sigFilters.loading")}
          </p>
        ) : error ? (
          <div role="alert" className="p-4">
            <p>{t("sigFilters.error")}</p>
            <Button variant="outline" size="sm" onClick={onRequest}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <div className="sig-filter-scroll">
            <section className="sig-filter-block">
              <h4>{t("sigFilters.quickPresets")}</h4>
              <div className="sig-preset-grid">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    variant={draft.preset === preset ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDraft(messagePreset(preset, types))}
                  >
                    {t(`sigFilters.presets.${preset}`)}
                  </Button>
                ))}
              </div>
            </section>
            <section className="sig-filter-block">
              <div className="sig-filter-block-title">
                <h4>{t("sigFilters.categories")}</h4>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, categories: null, preset: null })}
                >
                  {t("sigFilters.all")}
                </button>
              </div>
              <div className="sig-category-grid">
                {CATEGORY_IDS.map((id) => {
                  const count = counts.get(id) ?? 0;
                  return (
                    <label key={id} aria-disabled={count === 0}>
                      <Checkbox
                        aria-label={t(`sigFilters.categoriesList.${id}`)}
                        checked={draft.categories === null || draft.categories.includes(id)}
                        disabled={count === 0}
                        onCheckedChange={(value) => toggleCategory(id, value === true)}
                      />
                      <span>{t(`sigFilters.categoriesList.${id}`)}</span>
                      <span className="sig-occurrence">{count.toLocaleString()}</span>
                    </label>
                  );
                })}
              </div>
            </section>
            <section className="sig-filter-block">
              <div className="sig-filter-block-title">
                <h4>{t("sigFilters.messageNames")}</h4>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        names: visibleNames.map(([name]) => name),
                        preset: null,
                      })
                    }
                  >
                    {t("sigFilters.all")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, names: [], preset: null })}
                  >
                    {t("sigFilters.none")}
                  </button>
                </div>
              </div>
              <label className="sig-search">
                <Search size={14} />
                <input
                  aria-label={t("sigFilters.searchMessageType")}
                  placeholder={t("sigFilters.searchMessageType")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="sig-name-list">
                {visibleNames.map(([name, count]) => (
                  <label key={name}>
                    <Checkbox
                      aria-label={name}
                      checked={draft.names === null || draft.names.includes(name)}
                      onCheckedChange={(value) => toggleName(name, value === true)}
                    />
                    <span title={name}>{name}</span>
                    <span className="sig-occurrence">{count.toLocaleString()}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
        <footer className="sig-message-footer">
          <span>{t("sigFilters.selected", { count: selectedCount })}</span>
          <Button variant="ghost" size="sm" onClick={() => setDraft(ALL_MESSAGE_FILTERS)}>
            {t("sigFilters.clear")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("sigFilters.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={loading || error}
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            {t("sigFilters.apply")}
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
