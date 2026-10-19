// BC2: header and release notes share the SemVer in package.json (lots A/B/C : 1.38.0, séries Task Time).
import pkg from "../../package.json";
import changelog from "../../CHANGELOG.md?raw";

export const APP_VERSION: string = pkg.version;
export const CHANGELOG_RAW: string = changelog;

/** Bullet lines of the CHANGELOG section matching `version`, or [] if absent (never invented). */
export function releaseNotes(version: string, raw = CHANGELOG_RAW): string[] {
  const lines = raw.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(version));
  if (start < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    if (/^\s*-\s/.test(l)) out.push(l.replace(/^\s*-\s/, "").trim());
  }
  return out;
}
