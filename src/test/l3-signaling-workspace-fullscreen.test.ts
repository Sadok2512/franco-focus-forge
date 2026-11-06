import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("L3 Signaling local workspace fullscreen", () => {
  it("fills the workspace frame without requesting browser fullscreen", () => {
    const workspace = readFileSync("src/features/kpi/workspace.css", "utf8");
    const signaling = readFileSync("src/features/signaling/signaling.css", "utf8");

    expect(workspace).toContain(
      ".kpi-panel-shell:has(.signaling-workspace-embedded .signaling-inspection-expanded)",
    );
    expect(workspace).toMatch(/position:\s*absolute;[\s\S]*inset:\s*0;/);
    expect(workspace).toMatch(/height:\s*100%\s*!important;/);
    expect(signaling).toContain(
      ".signaling-workspace.signaling-workspace-embedded:has(.signaling-inspection-expanded)",
    );
    expect(signaling).toMatch(/height:\s*100%;[\s\S]*margin-top:\s*0;/);
  });
});
