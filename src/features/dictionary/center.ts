import { PROJECTS } from "@/lib/api/fixtures";
// Initial map viewport only (the map then fits to the returned GeoJSON). Not a business value.
export const PROJECTS_CENTER = (id: string): [number, number] => PROJECTS.find((p) => p.id === id)?.center ?? [2.35, 46.8];
