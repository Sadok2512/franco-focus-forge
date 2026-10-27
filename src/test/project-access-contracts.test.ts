import { describe, expect, it } from "vitest";
import { CreateProjectRequestSchema } from "@/lib/api/project-schemas";
import { ProjectShareSchema } from "@/lib/api/project-shares";

describe("project ownership, sharing and parsing contracts", () => {
  it("accepts a required private temporal parsing contract", () => {
    expect(
      CreateProjectRequestSchema.parse({
        name: "Private drive",
        visibility: "private",
        parse_decode_level: "light",
        parse_binning_mode: "temporal",
        parse_temporal_resolution: "native",
        parse_spatial_bin_m: null,
      }).visibility,
    ).toBe("private");
  });

  it("accepts spatial bins and validates exact share identities", () => {
    expect(
      CreateProjectRequestSchema.parse({
        name: "Spatial drive",
        visibility: "public",
        parse_decode_level: "deep",
        parse_binning_mode: "spatial",
        parse_temporal_resolution: null,
        parse_spatial_bin_m: 25,
      }).parse_spatial_bin_m,
    ).toBe(25);
    expect(
      ProjectShareSchema.parse({
        user_id: "user-b",
        email: "reader@bc4.local",
        role: "lecteur",
        created_at: "2026-10-27T18:00:00Z",
      }).email,
    ).toBe("reader@bc4.local");
  });

  it("rejects omitted visibility and unsupported resolutions", () => {
    expect(
      CreateProjectRequestSchema.safeParse({
        name: "Missing visibility",
        parse_decode_level: "light",
        parse_binning_mode: "temporal",
        parse_temporal_resolution: "5s",
        parse_spatial_bin_m: null,
      }).success,
    ).toBe(false);
  });
});
