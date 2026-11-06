import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, GripVertical, Palette, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { messageCategories, type MessageType } from "./message-filter";
import {
  DEFAULT_MESSAGE_COLORING,
  MESSAGE_COLOR_CATEGORIES,
  type MessageColorField,
  type MessageColoring,
  type MessageColorOperator,
  type MessageColorRule,
} from "./message-coloring";

const FIELDS: MessageColorField[] = [
  "message",
  "layer",
  "technology",
  "direction",
  "channel",
  "procedure",
  "status",
];
const OPERATORS: MessageColorOperator[] = ["equals", "contains", "starts", "in"];
const cloneDefaults = (): MessageColoring =>
  JSON.parse(JSON.stringify(DEFAULT_MESSAGE_COLORING)) as MessageColoring;

export function MessageColorPopover({
  value,
  types,
  onApply,
  open,
  onOpenChange,
}: {
  value: MessageColoring;
  types: MessageType[];
  onApply: (value: MessageColoring) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [dragged, setDragged] = useState<string | null>(null);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const type of types)
      for (const id of messageCategories(type)) {
        const colorId =
          id === "RRC_LTE"
            ? "rrc_lte"
            : id === "RRC_NR"
              ? "rrc_nr"
              : id.startsWith("NAS")
                ? "nas"
                : id === "PAGING"
                  ? "paging"
                  : id.includes("CCCH")
                    ? "ccch"
                    : id.includes("DCCH")
                      ? "dcch"
                      : ["S1AP", "NGAP"].includes(id)
                        ? "core"
                        : ["X2AP", "XNAP"].includes(id)
                          ? "handover"
                          : id === "IMS_SIP"
                            ? "ims"
                            : "other";
        counts.set(colorId, (counts.get(colorId) ?? 0) + type.count);
      }
    return counts;
  }, [types]);
  const updateRule = (id: string, patch: Partial<MessageColorRule>) =>
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  const addRule = () =>
    setDraft((current) => ({
      ...current,
      rules: [
        ...current.rules,
        {
          id: crypto.randomUUID(),
          enabled: true,
          field: "message",
          operator: "contains",
          value: "",
          color: "#dbeafe",
        },
      ],
    }));
  const reorder = (target: string) => {
    if (!dragged || dragged === target) return;
    setDraft((current) => {
      const rules = [...current.rules];
      const from = rules.findIndex((rule) => rule.id === dragged);
      const to = rules.findIndex((rule) => rule.id === target);
      const [rule] = rules.splice(from, 1);
      if (rule) rules.splice(to, 0, rule);
      return { ...current, rules };
    });
    setDragged(null);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="sig-color-trigger"
          data-testid="color-messages-trigger"
        >
          <Palette size={14} />
          <span>{t("sigColors.trigger")}</span>
          <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={12}
        className="sig-color-popover"
        data-testid="color-messages-popover"
      >
        <header className="sig-message-header">
          <Palette size={18} />
          <div className="min-w-0 flex-1">
            <h3>{t("sigColors.title")}</h3>
            <p>{t("sigColors.subtitle")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label={t("common.close")}
          >
            <X />
          </Button>
        </header>
        <div className="sig-color-scroll">
          <label className="sig-color-master">
            <Checkbox
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked === true })}
            />
            {t("sigColors.enabled")}
          </label>
          <section className="sig-filter-block">
            <h4>{t("sigColors.categories")}</h4>
            {MESSAGE_COLOR_CATEGORIES.map((id) => (
              <div className="sig-color-row" key={id}>
                <Checkbox
                  checked={draft.categories[id].enabled}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      categories: {
                        ...draft.categories,
                        [id]: { ...draft.categories[id], enabled: checked === true },
                      },
                    })
                  }
                />
                <span
                  className="sig-color-dot"
                  style={{ backgroundColor: draft.categories[id].color }}
                />
                <span>{t(`sigColors.category.${id}`)}</span>
                <span className="sig-occurrence">
                  {(categoryCounts.get(id) ?? 0).toLocaleString()}
                </span>
                <input
                  type="color"
                  aria-label={t("sigColors.pick", { name: t(`sigColors.category.${id}`) })}
                  value={draft.categories[id].color}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      categories: {
                        ...draft.categories,
                        [id]: { ...draft.categories[id], color: event.target.value },
                      },
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={t("sigColors.resetOne")}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      categories: {
                        ...draft.categories,
                        [id]: { ...DEFAULT_MESSAGE_COLORING.categories[id] },
                      },
                    })
                  }
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            ))}
          </section>
          <section className="sig-filter-block">
            <div className="sig-filter-block-title">
              <h4>{t("sigColors.rules")}</h4>
              <Button variant="outline" size="sm" onClick={addRule}>
                <Plus size={12} />
                {t("sigColors.addRule")}
              </Button>
            </div>
            <div className="sig-rule-list">
              {draft.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="sig-color-rule"
                  draggable
                  onDragStart={() => setDragged(rule.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorder(rule.id)}
                >
                  <GripVertical size={14} />
                  <Checkbox
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      updateRule(rule.id, { enabled: checked === true })
                    }
                  />
                  <select
                    value={rule.field}
                    onChange={(event) =>
                      updateRule(rule.id, { field: event.target.value as MessageColorField })
                    }
                  >
                    {FIELDS.map((field) => (
                      <option
                        key={field}
                        value={field}
                        disabled={field === "procedure" || field === "status"}
                      >
                        {t(`sigColors.field.${field}`)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.operator}
                    onChange={(event) =>
                      updateRule(rule.id, { operator: event.target.value as MessageColorOperator })
                    }
                  >
                    {OPERATORS.map((operator) => (
                      <option key={operator} value={operator}>
                        {t(`sigColors.operator.${operator}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={rule.value}
                    onChange={(event) => updateRule(rule.id, { value: event.target.value })}
                    placeholder={t("sigColors.value")}
                  />
                  <input
                    type="color"
                    value={rule.color}
                    onChange={(event) => updateRule(rule.id, { color: event.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={t("sigColors.deleteRule")}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        rules: draft.rules.filter((item) => item.id !== rule.id),
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <footer className="sig-message-footer">
          <Button variant="ghost" size="sm" onClick={() => setDraft(cloneDefaults())}>
            {t("sigColors.reset")}
          </Button>
          <span />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("sigFilters.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            {t("sigFilters.apply")}
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
