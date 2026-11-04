export function isDetachedMapView(pathname: string, search: string): boolean {
  return pathname === "/kpi" && new URLSearchParams(search).has("map_panel");
}

export function fullAppTabUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("map_panel");
  url.searchParams.delete("map_workspace");
  return url.toString();
}
