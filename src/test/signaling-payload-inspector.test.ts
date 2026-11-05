import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Signaling payload inspector", () => {
  it("keeps the ASN.1 tree without rendering the duplicated decoded-values summary", () => {
    const page = readFileSync("src/features/signaling/SignalingPage.tsx", "utf8");
    const css = readFileSync("src/features/signaling/signaling.css", "utf8");

    expect(page).toContain("<DecoderTree");
    expect(page).not.toContain("Decoded values");
    expect(page).not.toContain("decoded-values");
    expect(css).not.toContain(".sig-decoded");
  });
});
