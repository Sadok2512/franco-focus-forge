import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, MailCheck, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildMessageTree,
  checkState,
  searchMessageTree,
  setVisibleTypes,
  treeTypes,
  type MessageSelection,
  type MessageTech,
  type MessageType,
} from "./message-filter";

const badgeKinds: Record<string, string> = {
  "RRC LTE": "lte",
  "RRC NR": "nr",
  NAS: "nas",
  "Événements Nemo": "nemo",
  "MAC-RACH": "mac",
};
const techKinds: Record<MessageTech, string | null> = {
  LTE: "lte",
  NR: "nr",
  NAS: "nas",
  NEMO: "nemo",
  MAC: "mac",
  OTHER: null,
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

export function MessageFilterPopover({
  types,
  selection,
  onApply,
  onRequest,
  loading,
  error,
  disabled = false,
}: {
  types: MessageType[];
  selection: MessageSelection;
  onApply: (selection: MessageSelection) => void;
  onRequest: () => void;
  loading: boolean;
  error: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<MessageSelection>(selection);
  // Tree starts closed: nothing is expanded until the user opens a group.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const techLabel = (tech: MessageTech) => t(`sigFilters.tech.${tech}`);
  const tree = useMemo(() => buildMessageTree(types), [types]);
  const visibleTree = useMemo(
    () => searchMessageTree(tree, query, techLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, query],
  );
  const visible = useMemo(() => treeTypes(visibleTree), [visibleTree]);
  const chosen = draft ?? types.map((type) => type.key);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const searching = query.trim() !== "";
  const isOpen = (id: string) => searching || expanded.has(id);
  const toggle = (id: string) =>
    setExpanded((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const groupIds = tree.flatMap((tech) => [tech.id, ...tech.channels.map((c) => c.id)]);
  const changeOpen = (next: boolean) => {
    if (next) {
      setDraft(selection);
      setQuery("");
      setExpanded(new Set());
      onRequest();
    }
    setOpen(next);
  };
  const set = (list: MessageType[], checked: boolean | "indeterminate") =>
    setDraft(setVisibleTypes(chosen, list, checked === true));
  const Chevron = ({ id }: { id: string }) => (
    <button
      type="button"
      className="sig-tree-chevron"
      aria-label={t(isOpen(id) ? "sigFilters.collapseGroup" : "sigFilters.expandGroup")}
      aria-expanded={isOpen(id)}
      onClick={() => toggle(id)}
      disabled={searching}
    >
      {isOpen(id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  );
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="sig-message-trigger"
          disabled={disabled}
          data-testid="message-filter-trigger"
        >
          <MailCheck aria-hidden="true" />
          <span>
            {selection === null
              ? t("sigFilters.allMessages")
              : t("sigFilters.selected", { count: selection.length })}
          </span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={16}
        collisionPadding={12}
        className="sig-message-popover"
        aria-label={t("sigFilters.popupTitle")}
        data-testid="message-filter-popover"
      >
        <header className="sig-message-header">
          <span className="sig-filter-icon">
            <MailCheck size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3>{t("sigFilters.popupTitle")}</h3>
            <p>{t("sigFilters.popupSubtitle")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("sigFilters.close")}
            onClick={() => changeOpen(false)}
          >
            <X />
          </Button>
        </header>
        <div className="sig-message-actions">
          <label className="sig-search">
            <Search size={14} />
            <input
              aria-label={t("sigFilters.popupSearch")}
              placeholder={t("sigFilters.popupSearch")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="sig-message-toolbar">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || error}
            onClick={() => set(visible, true)}
          >
            {t(searching ? "sigFilters.selectVisible" : "sigFilters.all")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || error}
            onClick={() => set(visible, false)}
          >
            {t(searching ? "sigFilters.clearVisible" : "sigFilters.none")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={searching}
            onClick={() => setExpanded(new Set(groupIds))}
          >
            {t("sigFilters.expandAll")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={searching}
            onClick={() => setExpanded(new Set())}
          >
            {t("sigFilters.collapseAll")}
          </Button>
        </div>
        <p className="sig-message-scope">{t("sigFilters.scope")}</p>
        <div className="sig-message-options" data-testid="message-filter-options" role="tree">
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
          ) : visibleTree.length === 0 ? (
            <p role="status" className="p-4">
              {t("sigFilters.noTypes")}
            </p>
          ) : (
            visibleTree.map((tech) => {
              const techTypes = tech.channels.flatMap((c) => c.types);
              const kind = techKinds[tech.technology];
              return (
                <div key={tech.id} role="treeitem" aria-expanded={isOpen(tech.id)}>
                  <div
                    className="sig-tree-row sig-tree-tech"
                    data-testid={`tree-tech-${tech.technology}`}
                  >
                    <Chevron id={tech.id} />
                    <Checkbox
                      aria-label={techLabel(tech.technology)}
                      checked={checkState(techTypes, chosenSet)}
                      onCheckedChange={(c) => set(techTypes, c)}
                    />
                    <span className={`sig-layer-badge ${kind ? `sig-layer-${kind}` : ""}`}>
                      {techLabel(tech.technology)}
                    </span>
                    <span className="sig-occurrence">{tech.count.toLocaleString()}</span>
                  </div>
                  {isOpen(tech.id) &&
                    tech.channels.map((ch) => {
                      const chLabel = ch.channel ?? t("sigFilters.unclassified");
                      return (
                        <div key={ch.id} role="group">
                          <div
                            className="sig-tree-row sig-tree-channel"
                            data-testid={`tree-channel-${ch.id}`}
                          >
                            <Chevron id={ch.id} />
                            <Checkbox
                              aria-label={`${techLabel(tech.technology)} · ${chLabel}`}
                              checked={checkState(ch.types, chosenSet)}
                              onCheckedChange={(c) => set(ch.types, c)}
                            />
                            <span
                              className={
                                ch.channel
                                  ? "sig-tree-channel-name"
                                  : "sig-tree-channel-name text-muted-foreground italic"
                              }
                              title={ch.channel ? undefined : t("sigFilters.unclassifiedHint")}
                            >
                              {chLabel}
                            </span>
                            <span className="sig-occurrence">{ch.count.toLocaleString()}</span>
                          </div>
                          {isOpen(ch.id) &&
                            ch.types.map((type) => (
                              <label key={type.key} className="sig-tree-row sig-tree-message">
                                <Checkbox
                                  aria-label={type.name + " · " + type.protocol}
                                  checked={chosenSet.has(type.key)}
                                  onCheckedChange={(c) => set([type], c)}
                                />
                                <span className="sig-message-name" title={type.name}>
                                  {type.name}
                                </span>
                                <span
                                  className="sig-occurrence"
                                  title={t("sigFilters.occurrences", { count: type.count })}
                                >
                                  {type.count.toLocaleString()}
                                </span>
                              </label>
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>
        <footer className="sig-message-footer">
          <span>{t("sigFilters.selected", { count: chosen.length })}</span>
          <Button variant="outline" size="sm" onClick={() => changeOpen(false)}>
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
