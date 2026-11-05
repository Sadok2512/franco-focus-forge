export function readPreferencesWithLinkReset<T extends { links: Record<string, boolean> }>(
  currentKey: string,
  legacyKey: string,
  defaults: T,
): T {
  const current = localStorage.getItem(currentKey);
  if (current === null) {
    const legacy = JSON.parse(localStorage.getItem(legacyKey) ?? "{}") as Partial<T>;
    const migrated = { ...defaults, ...legacy, links: { ...defaults.links } } as T;
    localStorage.setItem(currentKey, JSON.stringify(migrated));
    return migrated;
  }
  const stored = JSON.parse(current) as Partial<T>;
  return {
    ...defaults,
    ...stored,
    links: { ...defaults.links, ...stored.links },
  } as T;
}
