import { beforeEach, describe, expect, it } from "vitest";
import {
  MAP_HEIGHT_OPTIONS,
  MAP_HEIGHT_PX,
  readMapHeight,
  writeMapHeight,
} from "@/features/kpi/map-height";

describe("map height preference", () => {
  beforeEach(() => localStorage.clear());

  it("offers exactly compact/default/large/xl with 300/600/800 px", () => {
    expect(MAP_HEIGHT_OPTIONS).toEqual(["compact", "default", "large", "xl"]);
    expect(MAP_HEIGHT_PX).toEqual({ compact: 300, large: 600, xl: 800 });
  });

  it("defaults to the flexible height when nothing is stored", () => {
    expect(readMapHeight("kpi")).toBe("default");
  });

  it("restores the persisted height per workspace scope", () => {
    writeMapHeight("kpi", "xl");
    writeMapHeight("metrics", "compact");
    expect(readMapHeight("kpi")).toBe("xl");
    expect(readMapHeight("metrics")).toBe("compact");
  });

  it("ignores a corrupted stored value", () => {
    localStorage.setItem("bc4.map.height.v1.kpi", "huge");
    expect(readMapHeight("kpi")).toBe("default");
  });
});
