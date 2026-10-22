import { it, expect, vi } from "vitest";
import { isApiMode } from "@/lib/api/http";
it("stubEnv probe", () => {
  console.log("before", isApiMode());
  vi.stubEnv("VITE_BC4_DATA", "mock");
  console.log("after stubEnv", isApiMode(), import.meta.env.VITE_BC4_DATA);
  expect(1).toBe(1);
});
