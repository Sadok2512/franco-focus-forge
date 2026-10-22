import type { SignalingLine } from "@/lib/api/signaling";

/** null means unrestricted; [] is an explicit empty selection. */
export type MessageSelection = string[] | null;
export type MessageType = { key: string; name: string; protocol: string; count: number };
export const messageTypeKey = (row: Pick<SignalingLine, "protocol" | "message_name">) =>
  JSON.stringify([row.protocol, row.message_name]);

export function messageTypes(rows: SignalingLine[]): MessageType[] {
  const groups = new Map<string, MessageType>();
  for (const row of rows) {
    const key = messageTypeKey(row);
    const found = groups.get(key);
    if (found) found.count++;
    else groups.set(key, { key, name: row.message_name, protocol: row.protocol, count: 1 });
  }
  return [...groups.values()].sort(
    (a, b) => a.protocol.localeCompare(b.protocol) || a.name.localeCompare(b.name),
  );
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
