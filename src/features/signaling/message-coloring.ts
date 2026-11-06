import type { SignalingLine } from "@/lib/api/signaling";

export type MessageColorCategory =
  | "rrc_lte"
  | "rrc_nr"
  | "nas"
  | "paging"
  | "ccch"
  | "dcch"
  | "core"
  | "handover"
  | "ims"
  | "security"
  | "mobility"
  | "other";
export type MessageColorField =
  "message" | "layer" | "technology" | "direction" | "channel" | "procedure" | "status";
export type MessageColorOperator = "equals" | "contains" | "starts" | "in";
export type MessageColorRule = {
  id: string;
  enabled: boolean;
  field: MessageColorField;
  operator: MessageColorOperator;
  value: string;
  color: string;
};
export type MessageColoring = {
  enabled: boolean;
  categories: Record<MessageColorCategory, { enabled: boolean; color: string }>;
  rules: MessageColorRule[];
};

export const DEFAULT_MESSAGE_COLORING: MessageColoring = {
  enabled: true,
  categories: {
    rrc_lte: { enabled: true, color: "#dbeafe" },
    rrc_nr: { enabled: true, color: "#ede9fe" },
    nas: { enabled: true, color: "#ffedd5" },
    paging: { enabled: true, color: "#fef3c7" },
    ccch: { enabled: true, color: "#cffafe" },
    dcch: { enabled: true, color: "#e0f2fe" },
    core: { enabled: true, color: "#e2e8f0" },
    handover: { enabled: true, color: "#fce7f3" },
    ims: { enabled: true, color: "#fae8ff" },
    security: { enabled: true, color: "#dcfce7" },
    mobility: { enabled: true, color: "#fef9c3" },
    other: { enabled: false, color: "#f1f5f9" },
  },
  rules: [],
};

export const MESSAGE_COLOR_CATEGORIES = Object.keys(
  DEFAULT_MESSAGE_COLORING.categories,
) as MessageColorCategory[];

export function parseMessageColoring(raw: string | null): MessageColoring {
  if (!raw) return DEFAULT_MESSAGE_COLORING;
  try {
    const value = JSON.parse(raw) as Partial<MessageColoring>;
    return {
      enabled: value.enabled !== false,
      categories: Object.fromEntries(
        MESSAGE_COLOR_CATEGORIES.map((id) => [
          id,
          { ...DEFAULT_MESSAGE_COLORING.categories[id], ...(value.categories?.[id] ?? {}) },
        ]),
      ) as MessageColoring["categories"],
      rules: Array.isArray(value.rules)
        ? value.rules.filter(
            (rule): rule is MessageColorRule =>
              !!rule &&
              typeof rule.id === "string" &&
              typeof rule.value === "string" &&
              typeof rule.color === "string",
          )
        : [],
    };
  } catch {
    return DEFAULT_MESSAGE_COLORING;
  }
}

export function messageColorCategory(row: SignalingLine): MessageColorCategory {
  const name = row.message_name.toLocaleLowerCase();
  const protocol = row.protocol.toLocaleLowerCase();
  if (/securitymode|authentication|cipher/.test(name)) return "security";
  if (/handover|mobility|reestablishment|cellchange/.test(name)) return "mobility";
  if (/\b(?:ims|sip)\b/.test(`${protocol} ${name}`)) return "ims";
  if (/\b(?:x2ap|xnap)\b/.test(`${protocol} ${name}`)) return "handover";
  if (row.channel === "PCCH" || name === "paging") return "paging";
  if (row.channel?.includes("CCCH")) return "ccch";
  if (row.channel?.includes("DCCH")) return "dcch";
  if (row.layer === "rrc_lte" || protocol === "rrc lte") return "rrc_lte";
  if (row.layer === "rrc_nr" || protocol === "rrc nr") return "rrc_nr";
  if (row.layer === "nas" || protocol === "nas") return "nas";
  if (/\b(?:s1ap|ngap)\b/.test(`${protocol} ${name}`)) return "core";
  return "other";
}

function ruleField(row: SignalingLine, field: MessageColorField) {
  if (field === "message") return row.message_name;
  if (field === "layer") return row.protocol;
  if (field === "technology") return row.technology ?? "";
  if (field === "direction") return row.direction ?? "";
  if (field === "channel") return row.channel ?? "";
  // The current row contract does not certify procedure/status text.
  return "";
}
function ruleMatches(row: SignalingLine, rule: MessageColorRule) {
  const actual = ruleField(row, rule.field).toLocaleLowerCase();
  const expected = rule.value.trim().toLocaleLowerCase();
  if (!actual || !expected) return false;
  if (rule.operator === "equals") return actual === expected;
  if (rule.operator === "starts") return actual.startsWith(expected);
  if (rule.operator === "in")
    return expected
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .includes(actual);
  return actual.includes(expected);
}

/** Custom rules win; otherwise use the certified row/category presentation. */
export function messageRowColor(row: SignalingLine, coloring: MessageColoring) {
  if (!coloring.enabled) return undefined;
  const custom = coloring.rules.find((rule) => rule.enabled && ruleMatches(row, rule));
  if (custom) return custom.color;
  const category = coloring.categories[messageColorCategory(row)];
  return category.enabled ? category.color : undefined;
}
