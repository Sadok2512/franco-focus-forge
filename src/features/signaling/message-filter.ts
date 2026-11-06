import type { SignalingLine } from "@/lib/api/signaling";
import { CHANNEL_ORDER, classifyRrc, type ChannelSource } from "./rrc-channels";

/** null means unrestricted; [] is an explicit empty selection. */
export type MessageSelection = string[] | null;
export type MessageTech = "LTE" | "NR" | "NAS" | "NEMO" | "MAC" | "OTHER";
export type MessageType = {
  key: string;
  name: string;
  protocol: string;
  count: number;
  technology: MessageTech;
  /** Decoded channel first, then the validated 3GPP catalogue; null = Unclassified. */
  channel: string | null;
  channelSource?: ChannelSource;
  /** Catalogue/decoded disagreement kept for reporting; the source channel is never overwritten. */
  conflict?: string | null;
  /** RAT supplied by the row population. It is never inferred from a name. */
  radioTechnology?: string | null;
};

export type MessageCategoryId =
  | "BCCH"
  | "PAGING"
  | "DL_CCCH"
  | "UL_CCCH"
  | "DL_DCCH"
  | "UL_DCCH"
  | "NAS_LTE"
  | "NAS_5G"
  | "RRC_LTE"
  | "RRC_NR"
  | "S1AP"
  | "NGAP"
  | "X2AP"
  | "XNAP"
  | "IMS_SIP"
  | "OTHER";

export type MessageFilterState = {
  /** null means unrestricted, [] means explicitly no category. */
  categories: MessageCategoryId[] | null;
  /** Exact backend message names. null means unrestricted. */
  names: string[] | null;
  preset: string | null;
};

export const ALL_MESSAGE_FILTERS: MessageFilterState = {
  categories: null,
  names: null,
  preset: "all",
};

export function parseMessageFilter(raw: string | null): MessageFilterState {
  if (!raw) return ALL_MESSAGE_FILTERS;
  try {
    const value = JSON.parse(raw) as Partial<MessageFilterState>;
    const names = value.names;
    return {
      categories:
        value.categories === null || Array.isArray(value.categories)
          ? (value.categories as MessageCategoryId[] | null)
          : null,
      names:
        names === null
          ? null
          : Array.isArray(names)
            ? names.filter((name): name is string => typeof name === "string")
            : null,
      preset: typeof value.preset === "string" ? value.preset : null,
    };
  } catch {
    return ALL_MESSAGE_FILTERS;
  }
}
export const messageTypeKey = (row: Pick<SignalingLine, "protocol" | "message_name">) =>
  JSON.stringify([row.protocol, row.message_name]);

/** Technology group from the source layer/protocol only. */
export function messageTech(row: Pick<SignalingLine, "protocol" | "layer">): MessageTech {
  const p = row.protocol.toLowerCase();
  if (row.layer === "rrc_lte" || p === "rrc lte") return "LTE";
  if (row.layer === "rrc_nr" || p === "rrc nr") return "NR";
  if (row.layer === "nas" || p === "nas") return "NAS";
  if (row.layer === "event" || p.includes("nemo")) return "NEMO";
  if (row.layer === "mac" || p.includes("mac")) return "MAC";
  return "OTHER";
}

export function messageTypes(rows: SignalingLine[]): MessageType[] {
  const groups = new Map<
    string,
    MessageType & { channels: Set<string | null>; radioTechnologies: Set<string | null> }
  >();
  for (const row of rows) {
    const key = messageTypeKey(row);
    const channel = row.channel?.trim() || null;
    const found = groups.get(key);
    if (found) {
      found.count++;
      found.channels.add(channel);
      found.radioTechnologies.add(row.technology?.trim().toUpperCase() || null);
    } else
      groups.set(key, {
        key,
        name: row.message_name,
        protocol: row.protocol,
        count: 1,
        technology: messageTech(row),
        channel: null,
        channels: new Set([channel]),
        radioTechnologies: new Set([row.technology?.trim().toUpperCase() || null]),
      });
  }
  return [...groups.values()]
    .map(({ channels, radioTechnologies, ...type }): MessageType => {
      const radioTechnology =
        radioTechnologies.size === 1 ? ([...radioTechnologies][0] ?? null) : null;
      if (type.technology !== "LTE" && type.technology !== "NR")
        return {
          ...type,
          radioTechnology,
          channel: null,
          channelSource: "UNCLASSIFIED",
          conflict: null,
        };
      if (channels.size > 1)
        // Rows of one type disagree on the decoded channel: keep it visible as unclassified.
        return {
          ...type,
          radioTechnology,
          channel: null,
          channelSource: "UNCLASSIFIED",
          conflict: [...channels].join("|"),
        };
      const c = classifyRrc(type.technology, type.name, [...channels][0]);
      return {
        ...type,
        radioTechnology,
        channel: c.logicalChannel,
        channelSource: c.classificationSource,
        conflict: c.conflict,
      };
    })
    .sort((a, b) => a.protocol.localeCompare(b.protocol) || a.name.localeCompare(b.name));
}

const protocolToken = (type: MessageType) =>
  `${type.protocol} ${type.name}`.trim().toLocaleUpperCase();

/** Categories are based on decoded/catalogued channels and explicit protocol fields only. */
export function messageCategories(type: MessageType): MessageCategoryId[] {
  const ids = new Set<MessageCategoryId>();
  const token = protocolToken(type);
  if (type.channel === "BCCH") ids.add("BCCH");
  if (type.channel === "PCCH") ids.add("PAGING");
  if (type.channel === "DL-CCCH") ids.add("DL_CCCH");
  if (type.channel === "UL-CCCH") ids.add("UL_CCCH");
  if (type.channel === "DL-DCCH") ids.add("DL_DCCH");
  if (type.channel === "UL-DCCH") ids.add("UL_DCCH");
  if (type.technology === "LTE") ids.add("RRC_LTE");
  if (type.technology === "NR") ids.add("RRC_NR");
  if (type.technology === "NAS" && type.radioTechnology === "LTE") ids.add("NAS_LTE");
  if (type.technology === "NAS" && type.radioTechnology === "NR") ids.add("NAS_5G");
  if (/\bS1AP\b/.test(token)) ids.add("S1AP");
  if (/\bNGAP\b/.test(token)) ids.add("NGAP");
  if (/\bX2AP\b/.test(token)) ids.add("X2AP");
  if (/\bXNAP\b/.test(token)) ids.add("XNAP");
  if (/\b(?:IMS|SIP)\b/.test(token)) ids.add("IMS_SIP");
  if (!ids.size) ids.add("OTHER");
  return [...ids];
}

export function selectionForMessageFilter(
  types: MessageType[],
  filter: MessageFilterState,
): MessageSelection {
  if (filter.categories === null && filter.names === null) return null;
  const categories = filter.categories === null ? null : new Set(filter.categories);
  const names = filter.names === null ? null : new Set(filter.names);
  return types
    .filter(
      (type) =>
        (categories === null || messageCategories(type).some((id) => categories.has(id))) &&
        (names === null || names.has(type.name)),
    )
    .map((type) => type.key);
}

export function messageCategoryCounts(types: MessageType[]) {
  const counts = new Map<MessageCategoryId, number>();
  for (const type of types)
    for (const id of messageCategories(type)) counts.set(id, (counts.get(id) ?? 0) + type.count);
  return counts;
}

const nameContains = (type: MessageType, terms: RegExp) => terms.test(type.name);

export function messagePreset(preset: string, types: MessageType[]): MessageFilterState {
  if (preset === "all") return ALL_MESSAGE_FILTERS;
  if (preset === "rrc") return { categories: ["RRC_LTE", "RRC_NR"], names: null, preset };
  if (preset === "nas") return { categories: ["NAS_LTE", "NAS_5G"], names: null, preset };
  if (preset === "rrc_nas")
    return {
      categories: ["RRC_LTE", "RRC_NR", "NAS_LTE", "NAS_5G"],
      names: null,
      preset,
    };
  if (preset === "control")
    return { categories: ["BCCH", "PAGING", "DL_CCCH", "UL_CCCH"], names: null, preset };
  if (preset === "paging") return { categories: ["PAGING"], names: null, preset };
  if (preset === "call") return { categories: ["IMS_SIP"], names: null, preset };
  const pattern =
    preset === "mobility"
      ? /handover|mobility|reconfiguration|reestablishment/i
      : /failure|failed|reject|error|drop|rlf|scgfailure/i;
  return {
    categories: null,
    names: [
      ...new Set(types.filter((type) => nameContains(type, pattern)).map((type) => type.name)),
    ],
    preset,
  };
}

const channelRank = (c: string | null) => {
  if (c === null) return 1e9;
  const i = CHANNEL_ORDER.indexOf(c);
  return i < 0 ? 1e8 : i;
};

export const TECH_ORDER: MessageTech[] = ["LTE", "NR", "NAS", "NEMO", "MAC", "OTHER"];
export type ChannelNode = {
  id: string;
  channel: string | null;
  count: number;
  types: MessageType[];
};
export type TechNode = {
  id: string;
  technology: MessageTech;
  count: number;
  channels: ChannelNode[];
};

/** Technology → Channel → Message, only from present types; unproven channels go to null (Unclassified). */
export function buildMessageTree(types: MessageType[]): TechNode[] {
  const out: TechNode[] = [];
  for (const technology of TECH_ORDER) {
    const own = types.filter((t) => t.technology === technology);
    if (!own.length) continue;
    const byChannel = new Map<string | null, MessageType[]>();
    for (const t of own) byChannel.set(t.channel, [...(byChannel.get(t.channel) ?? []), t]);
    const channels = [...byChannel.entries()]
      .sort(([a], [b]) => channelRank(a) - channelRank(b) || (a ?? "").localeCompare(b ?? ""))
      .map(([channel, list]) => ({
        id: `${technology}/${channel ?? ""}`,
        channel,
        count: list.reduce((s, t) => s + t.count, 0),
        types: list,
      }));
    out.push({ id: technology, technology, count: own.reduce((s, t) => s + t.count, 0), channels });
  }
  return out;
}

/** Hierarchical search: a matching technology or channel keeps all its children. */
export function searchMessageTree(
  tree: TechNode[],
  query: string,
  techLabel: (t: MessageTech) => string = (t) => t,
) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return tree;
  const has = (s: string | null) => !!s && s.toLocaleLowerCase().includes(q);
  return tree
    .map((tech) => {
      if (has(tech.technology) || has(techLabel(tech.technology))) return tech;
      const channels = tech.channels
        .map((c) => (has(c.channel) ? c : { ...c, types: c.types.filter((t) => has(t.name)) }))
        .filter((c) => c.types.length);
      return { ...tech, channels };
    })
    .filter((tech) => tech.channels.length);
}

export const treeTypes = (tree: TechNode[]) =>
  tree.flatMap((t) => t.channels.flatMap((c) => c.types));

export function checkState(types: MessageType[], selected: Set<string>): boolean | "indeterminate" {
  const n = types.filter((t) => selected.has(t.key)).length;
  return n === 0 ? false : n === types.length ? true : "indeterminate";
}

export function searchMessageTypes(types: MessageType[], query: string) {
  const q = query.trim().toLocaleLowerCase();
  return types.filter((type) => type.name.toLocaleLowerCase().includes(q));
}

export function setVisibleTypes(selected: string[], visible: MessageType[], checked: boolean) {
  const next = new Set(selected);
  for (const type of visible) {
    if (checked) next.add(type.key);
    else next.delete(type.key);
  }
  return [...next];
}

export function reconcileMessageSelection(
  selected: MessageSelection,
  types: MessageType[],
): MessageSelection {
  if (selected === null) return null;
  const available = new Set(types.map((type) => type.key));
  return selected.filter((key) => available.has(key));
}

export function filterMessageRows(rows: SignalingLine[], selection: MessageSelection) {
  if (selection === null) return rows;
  const allowed = new Set(selection);
  return rows.filter((row) => allowed.has(messageTypeKey(row)));
}

export function messagePage(rows: SignalingLine[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const effective = page > pages ? 1 : Math.max(1, page);
  return {
    rows: rows.slice((effective - 1) * size, effective * size),
    total: rows.length,
    page: effective,
    size,
    pages,
  };
}

export function messageRowsCsv(rows: SignalingLine[]) {
  const fields = [
    "seq",
    "t_rel_s",
    "protocol",
    "message_name",
    "direction",
    "technology",
    "size_bytes",
    "ecgi",
    "pci",
    "source",
  ] as const;
  const quote = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[=+@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    fields.join(","),
    ...rows.map((row) => fields.map((key) => quote(row[key])).join(",")),
  ].join("\r\n");
}
