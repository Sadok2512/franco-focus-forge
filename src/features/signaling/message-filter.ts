import type { SignalingLine } from "@/lib/api/signaling";

/** null means unrestricted; [] is an explicit empty selection. */
export type MessageSelection = string[] | null;
export type MessageTech = "LTE" | "NR" | "NAS" | "NEMO" | "MAC" | "OTHER";
export type MessageType = {
  key: string;
  name: string;
  protocol: string;
  count: number;
  technology: MessageTech;
  /** Decoded channel supplied by the VM; null when absent or inconsistent (never guessed from the name). */
  channel: string | null;
};
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
  const groups = new Map<string, MessageType & { channels: Set<string | null> }>();
  for (const row of rows) {
    const key = messageTypeKey(row);
    const channel = row.channel?.trim() || null;
    const found = groups.get(key);
    if (found) {
      found.count++;
      found.channels.add(channel);
    } else
      groups.set(key, {
        key,
        name: row.message_name,
        protocol: row.protocol,
        count: 1,
        technology: messageTech(row),
        channel: null,
        channels: new Set([channel]),
      });
  }
  return [...groups.values()]
    .map(({ channels, ...type }) => ({
      ...type,
      channel: channels.size === 1 ? ([...channels][0] ?? null) : null,
    }))
    .sort((a, b) => a.protocol.localeCompare(b.protocol) || a.name.localeCompare(b.name));
}

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
      .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
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
